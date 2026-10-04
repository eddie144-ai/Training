'use strict';
/* Iron & Eggs (built as Shredded Trainer): Trainer and Shredded System in one app, set up for the cut.
   Served at eddie144-ai.github.io/ (the main copy) and at /Training/shredded-trainer/; both share one store.
   Trainer's chains, programmes, fasting, recipes, goals and journal, plus the Gironda carb-up clock, the weekly
   decision rules, red-flag symptoms, progress photos, barcode scanning and calendar reminders.
   All data lives in localStorage on this device (shtrainer.* keys). Trainer's own data is only ever read,
   once, when you choose to bring it over. Content templates are in data.js. */

// ===========================================================================
// Constants
// ===========================================================================
const STORE_KEY = 'shtrainer.v1';
const OLD_KEY = 'shtrainer.v2-backup';
const TRAINER_KEY = 'trainer.v1'; // read once, on request, to copy your Trainer history in
const CHAINS_KEY = 'shtrainer.chains'; // a small summary of your chains, read by the home page at eddie144-ai.github.io
// Background: Vince Gironda in Tomorrow's Man, June 1953 (Irvin Johnson Health Studio). Public domain in the US
// (published 1931-63, copyright not renewed). Loaded from Wikimedia Commons and cached by the service worker.
const GIRONDA_PHOTO = 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Vince_Gironda_Tomorrows_Man_v1_n5_1953.jpg';
const GIRONDA_CREDIT = 'Vince Gironda, Tomorrow\'s Man, June 1953. Irvin Johnson Health Studio. Public domain, via Wikimedia Commons.';

// Chains: strict day-by-day streaks. pts = XP per day kept.
const CHAINS = [
  { id: 'coffee', name: 'No coffee', stat: 'MND', pts: 5, desc: 'No coffee. Tea is fine. Keeps counting unless you tap I had coffee.' },
  { id: 'diet', name: 'Diet dialled in', stat: 'NUT', pts: 4, desc: 'Meals eaten the way the day is set (18:6, one meal or fast) and calories under target.' },
  { id: 'cut', name: 'Cut day', stat: 'NUT', pts: 4, desc: 'Only the Gironda meals: 6 eggs + 3 patties, and 6 eggs + steak. Nothing else.' },
  { id: 'fasting', name: 'Fasting kept', stat: 'NUT', pts: 3, desc: 'Inside the 18:6 window, one meal in one sitting, or a fast day with nothing eaten.' },
  { id: 'protein', name: 'Protein hit', stat: 'NUT', pts: 3, desc: 'Protein at or over your target on an 18:6 day. One-meal and fast days don\'t count against it.' },
  { id: 'training', name: 'Training plan followed', stat: 'STR', pts: 3, desc: 'Trained on a training day, or rested on a rest or fast day.' },
  { id: 'sessions', name: '4 sessions this week', stat: 'STR', pts: 0, weekly: true, desc: 'Four training sessions Monday to Sunday: the 4-day split.' },
  { id: 'steps', name: 'Steps', stat: 'END', pts: 0, weekly: true, desc: '15,000 steps on 5 days a week, or 75,000 in the week.' },
  { id: 'sleep', name: 'Sleep 7.5 h+', stat: 'VIT', pts: 3, desc: 'Log last night\'s sleep: 7.5 hours or more keeps it.' },
  { id: 'plan', name: 'Tomorrow planned', stat: 'MND', pts: 3, desc: 'Tomorrow\'s plan saved today.' },
];

// Your last logged weights from the Grok tracker (September 2026), built in so week 1 starts from real numbers.
// [kg, reps] per set; null = bodyweight or not recorded. Anything you log yourself, or a newer weight, wins.
const liftSets = (kg, sets, reps) => Array.from({ length: sets }, () => [kg, reps]);
const SEED_LIFTS = [
  ['Reverse Grip Bench Press', '2026-09-22', liftSets(25, 4, 8)],
  ['V-Bar Dumbbell Chest Press', '2026-09-22', liftSets(25, 4, 8)],
  ['2x Dumbbell Pullover into Chest Press', '2026-09-22', liftSets(22, 4, 8)],
  ['Close Grip Bench Press', '2026-09-22', liftSets(25, 4, 8)],
  ['Lying Tricep Zottman Curls', '2026-09-22', liftSets(20, 3, 8)],
  ['Lat Machine Tricep Pulldown', '2026-09-22', liftSets(26.1, 3, 8)],
  ['Barbell Squat', '2026-09-23', liftSets(110, 3, 8)],
  ['Leg Press', '2026-09-23', liftSets(113, 5, 8)],
  ['Romanian Deadlift', '2026-09-23', liftSets(70, 4, 8)],
  ['Standing Calf Raise', '2026-09-23', liftSets(134, 4, 12)],
  ['Leg Curl Machine for Lower Abs', '2026-09-23', liftSets(null, 3, 15), 'Bodyweight, 15 reps'],
  ['Barbell Plate Lying Side Twists', '2026-09-23', liftSets(15, 3, 15), '15 kg plate, 15 a side'],
  ['Straight Arm Shoulder Raises', '2026-09-24', liftSets(15, 4, 8)],
  ['Arnold Press', '2026-09-24', liftSets(15, 4, 8)],
  ['Barbell Upright Row', '2026-09-24', liftSets(40, 4, 8)],
  ['Shrugs', '2026-09-24', [[60, 8], [75, 8], [90, 8]], 'Pyramid 60–90 kg (96 kg was too heavy)'],
  ['Barbell Deadlift', '2026-09-18', [[50, 8], [70, 8], [80, 8]], 'Week 1: 50 / 70 / 80 kg'],
  ['Barbell Bent-Over Row', '2026-09-18', liftSets(50, 4, 8), 'Week 1'],
  ['Spider Curls', '2026-09-18', liftSets(10, 4, null), 'Week 1: 7–10 kg'],
  ['Dumbbell Preacher Curls (Pinkie Inwards)', '2026-09-18', liftSets(9, 3, null), 'Week 1: 7–9 kg'],
  ['Dumbbell Hammer Concentration Curls', '2026-09-25', liftSets(20, 3, 8)],
  ['Seated Zottman Curls', '2026-09-18', liftSets(8, 3, null), 'Week 1: 7–8 kg'],
];
// Adds the built-in weights without overwriting a newer one you already have.
function seedLifts(baselines) {
  for (const [name, date, sets, note] of SEED_LIFTS) {
    const k = exKey(name);
    if (baselines[k]?.date && baselines[k].date >= date) continue;
    baselines[k] = { name, date, note: note || 'Last logged weights (Grok tracker)', sets: sets.map(([kg, reps]) => ({ kg, reps })) };
  }
  return baselines;
}

// Your own "No ___" chains, checked in by hand like coffee. `since` carries in days clean before the app.
const customChainDefs = () => (S.customChains || []).filter((c) => c.active !== false)
  .map((c) => ({ id: c.id, name: c.name, stat: 'MND', pts: 5, custom: true, since: c.since || null, created: c.created || null, desc: 'Keeps counting unless you tap I slipped.' }));
// Coffee first, then your own clean-streak chains, then the rest.
const allChains = () => [CHAINS[0], ...customChainDefs(), ...CHAINS.slice(1)];
const chainDef = (id) => allChains().find((c) => c.id === id);
// Today shows health first (diet, fasting, training, steps, sleep), then the clean chains and planning.
const HEALTH_CHAINS = ['diet', 'cut', 'fasting', 'protein', 'training', 'sessions', 'steps', 'sleep'];
const healthChains = () => HEALTH_CHAINS.map(chainDef);
const otherChains = () => allChains().filter((c) => !HEALTH_CHAINS.includes(c.id));

// Health and diet come first; these get "a little bit" each day: one tap when you've done something.
const LIFE_AREAS = [
  ['youtube', 'YouTube', 'An idea, a clip filmed, ten minutes of editing'],
  ['wealth', 'Wealth', 'Money, work or a skill that pays'],
  ['family', 'Family & the rest', 'A call, a hand with something, the house'],
];

const QUESTS = {
  steps:    { name: '15,000 Steps',      stat: 'END', note: 'Enter your Garmin total. A sweat-suit walk is a bonus.' },
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
  ['END', 'Endurance', 'Steps and sweat-suit walks'],
  ['NUT', 'Nutrition', 'Diet chain, protein and fasts'],
  ['VIT', 'Recovery', 'Sleep and hydration'],
  ['MND', 'Mind', 'No coffee, planning, journal and goals'],
];
const STAT_LEVEL_XP = 60;

const PTS = { sessionsWeek: 20, perfect: 10, dream: 3, video: 15, garmin: 3, stepsWeek: 20, sweat: 5, goal1: 2, goalAll: 5, goalWeek: 15, session: 15, pr: 5, weigh: 2, measure: 5, author: 10, review: 20, week: 20, milestone: 15, goal: 50, ach: 25, fastDay: 10, life: 3 };

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
      proteinGoal: 170, kcalGoal: 1900, carbGoal: 80, fatGoal: 90, fluidMl: 3500, walkExtraMl: 750, stepGoal: 15000, stepDays: 5, stepWeek: 75000, sleepGoal: 7.5, refeedWeeks: 6, protein170: true,
      carbupHours: 96, goalLow: 70, seededLifts: true, weighTime: '07:00', trainTime: '18:00', background: 'gironda', bgPhotoId: null,
      startWeight: 95, startFixed: true, target: 75, heightCm: null, cycleStart: '2026-10-05', cycleFixed: true, mondayStart: true, highContrast: false,
      window: { from: '09:00', to: '15:00' }, chainStart: '2026-10-05', coffeeStart: '2026-10-01',
      family: 'cycle', tier: 'intermediate', active: { cycle: 'my4week', hit: 'mentzer_ab' },
    },
    programs: Object.fromEntries(PROGRAM_TEMPLATES.map((t) => [t.id, programFromTemplate(t)])),
    baselines: seedLifts({}),
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
    garmin: {},
    channel: { name: '', url: '' },
    customChains: [],
    dreams: {},
    videos: [],
    fluids: [],
    compounds: [],
    goals: seedGoals(),
    goalDefs: { daily: [], weekly: [] },
    dayGoals: {},
    weekGoals: {},
    weekCounts: {},
    principles: [],
    pack: null,
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
    goalDefs: { ...d.goalDefs, ...(s.goalDefs || {}) },
  };
  for (const t of PROGRAM_TEMPLATES) if (!out.programs[t.id]) out.programs[t.id] = programFromTemplate(t);
  // Built-in programs refresh when their template is revised, unless you've edited them.
  for (const t of PROGRAM_TEMPLATES) {
    const cur = out.programs[t.id];
    if (t.version && (cur.version || 1) < t.version && !cur.edited) out.programs[t.id] = programFromTemplate(t);
  }
  out.fluids = (out.fluids || []).map((f) => (f.type === 'coffee' ? { ...f, type: 'tea' } : f));
  delete out.refeeds;
  // One-time move of the old placeholder cycle start (5 Oct) to the real restart date, 1 Oct.
  // One-time move of the old 90 kg placeholder to the real start weigh-in, 96.8 kg on 1 Oct 2026.
  if (!s.settings?.startFixed) {
    if (out.settings.startWeight === 90) out.settings.startWeight = 96.8;
    out.settings.startFixed = true;
  }
  // Programme moved to Monday 5 Oct 2026; the clean chains (coffee and your own) keep running from 1 Oct.
  if (!s.settings?.mondayStart) {
    out.settings.coffeeStart = out.settings.coffeeStart || (out.settings.chainStart <= '2026-10-01' ? out.settings.chainStart : '2026-10-01');
    if (out.settings.chainStart === '2026-10-01') out.settings.chainStart = '2026-10-05';
    if (out.settings.cycleStart === '2026-10-01' || out.settings.cycleStart === '2026-10-05') out.settings.cycleStart = '2026-10-05';
    out.settings.mondayStart = true;
    out.settings.cycleFixed = true;
  }
  // One-time: your last tracker weights become the starting points (a newer one you already have is kept).
  if (!s.settings?.seededLifts) {
    out.baselines = seedLifts({ ...(out.baselines || {}) });
    out.settings.seededLifts = true;
  }
  // One-time: protein target matches the two Gironda meals (77 + 93 g).
  if (!s.settings?.protein170) {
    if (out.settings.proteinGoal === 180) out.settings.proteinGoal = 170;
    out.settings.protein170 = true;
  }
  if (!s.settings?.cycleFixed) {
    if (out.settings.cycleStart === '2026-10-05') out.settings.cycleStart = '2026-10-01';
    out.settings.cycleFixed = true;
  }
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
    if (!raw) return { ...freshState(), notice: 'start' };
    const parsed = JSON.parse(raw);
    if ((parsed.v || 1) < 3) {
      // One-time fresh start for version 3. The old data is kept aside, untouched, in case it's needed.
      localStorage.setItem(OLD_KEY, raw);
      const n = cleanSlate(normalise(parsed), true);
      n.notice = 'v3';
      localStorage.setItem(STORE_KEY, JSON.stringify(n));
      return n;
    }
    const n = normalise(parsed);
    if (!parsed.settings?.cycleFixed || !parsed.settings?.startFixed || !parsed.settings?.mondayStart || !parsed.settings?.protein170 || !parsed.settings?.seededLifts) localStorage.setItem(STORE_KEY, JSON.stringify(n));
    return n;
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
const fluidGoal = (date) => S.settings.fluidMl + (S.days[date]?.sweat ? S.settings.walkExtraMl : 0);
const latestWeight = () => [...S.weights].sort((a, b) => a.date.localeCompare(b.date)).pop() || null;
const chainStart = () => S.settings.chainStart;
// The clean chains (no coffee and your own "No ___" chains) can start before the rest of the programme.
const cleanStart = () => (S.settings.coffeeStart && S.settings.coffeeStart < chainStart() ? S.settings.coffeeStart : chainStart());
const firstStart = () => cleanStart();
const isClean = (def) => !!def && (def.id === 'coffee' || def.custom);

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

// How you're eating on a day: the 18:6 window (default), one meal in one sitting at any time, or a fast day.
const EAT_MODES = [['window', '18:6 window'], ['omad', 'One meal'], ['fast', 'Fast day']];
const OMAD_SITTING_MIN = 120;
const eatMode = (date) => (S.days[date]?.fast || planKind(date) === 'fast' ? 'fast' : S.days[date]?.eat === 'omad' ? 'omad' : 'window');
// Were the meals eaten the way the day was set up? Fast day: none. One meal: one sitting. Window: all inside it.
function mealTimingOk(date) {
  const meals = mealsOn(date);
  if (!meals.length) return true;
  const mode = eatMode(date);
  if (mode === 'fast') return false;
  if (mode === 'omad') { const first = new Date(meals[0].at); return meals.every((m) => (new Date(m.at) - first) / 60000 <= OMAD_SITTING_MIN); }
  return meals.every((m) => inWindow(m.at));
}
// The day's eating is finished: the window has closed, the one meal is eaten, or the fast day's window has passed.
const eatingDone = (date) => (eatMode(date) === 'omad' ? mealsOn(date).length > 0 : passed(date, win().to));

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
  // Clean chains run on their own: a past day counts as clean unless you reported a slip.
  if (chainDef(id)?.custom || id === 'coffee') return past ? 'done' : 'pending';
  switch (id) {
    // Diet chains count as kept unless the log shows otherwise (or you tap I broke it): a past day with nothing logged is kept.
    case 'diet': {
      const meals = mealsOn(date);
      if (!mealTimingOk(date)) return 'miss';
      if (meals.length && !isRefeed(date) && macrosOn(date).kcal > S.settings.kcalGoal) return 'miss';
      return past || eatingDone(date) ? 'done' : 'pending';
    }
    case 'training': {
      const trained = workoutsOn(date).length > 0;
      const kind = planKind(date);
      if (kind === 'train') return trained ? 'done' : past ? 'miss' : 'pending';
      if (kind === 'rest' || kind === 'fast') return trained ? 'miss' : 'done';
      if (trained || trainingRecovered(date)) return 'done';
      return past ? 'miss' : 'pending';
    }
    case 'steps': return stepsOn(date) >= S.settings.stepGoal ? 'done' : past ? 'miss' : 'pending';
    case 'sessions': return workoutsOn(date).length ? 'done' : 'off'; // the chain itself is judged by the week
    case 'fasting': {
      // Only the timing: inside the window, one sitting on a one-meal day, nothing on a fast day.
      if (!mealTimingOk(date)) return 'miss';
      return past || eatingDone(date) ? 'done' : 'pending';
    }
    case 'protein': {
      const meals = mealsOn(date);
      // A fast day or a one-meal day has its own rules: protein isn't judged.
      if (eatMode(date) !== 'window') return past || eatingDone(date) ? 'done' : 'pending';
      if (macrosOn(date).p >= S.settings.proteinGoal) return 'done';
      if (!past) return 'pending';
      // A past day counts unless you logged something other than the Gironda meals and still came up short.
      return meals.every((m) => CUT_REFS.includes(m.ref)) ? 'done' : 'miss';
    }
    case 'cut': {
      // Only the two Gironda meals. A fast day or a planned refeed counts as on plan.
      const meals = mealsOn(date);
      if (meals.some((m) => !CUT_REFS.includes(m.ref)) && !isRefeed(date)) return 'miss';
      if (isRefeed(date) || CUT_REFS.every((r) => meals.some((m) => m.ref === r))) return 'done';
      if (eatMode(date) === 'omad' && meals.length) return 'done';
      if (eatMode(date) === 'fast' && !meals.length && eatingDone(date)) return 'done';
      return past ? 'done' : 'pending';
    }
    case 'sleep': {
      // The night that ended on this morning, from the sleep log (or Garmin).
      const sl = sleepOn(date);
      if (sl) return sl.hours >= S.settings.sleepGoal ? 'done' : 'miss';
      return past ? 'miss' : 'pending';
    }
    case 'plan': {
      const p = S.plans[addDays(date, 1)];
      return p?.madeOn && p.madeOn <= date ? 'done' : past ? 'miss' : 'pending';
    }
  }
  return 'pending';
}

const CUT_REFS = ['gironda1', 'gironda2'];
// The diet chains: kept automatically unless the log shows otherwise, with a one-tap override.
const FOOD_CHAINS = ['diet', 'cut', 'fasting', 'protein'];

// ---- steps: a weekly target ------------------------------------------------
const stepsOn = (date) => S.days[date]?.steps || 0;
// A week passes with the step goal on 5 days, or the weekly total. A part week (the first one) is pro-rated.
function stepsWeek(ws) {
  const st = S.settings;
  const t = today();
  const from = ws < chainStart() ? chainStart() : ws;
  const end = addDays(ws, 6);
  const avail = daysBetween(from, end) + 1;
  const needDays = Math.min(st.stepDays, avail);
  const needTotal = Math.round(st.stepWeek * needDays / st.stepDays);
  let count = 0, total = 0;
  for (let d = from; d <= end && d <= t; d = addDays(d, 1)) {
    total += stepsOn(d);
    if (chainStatus(d, 'steps') === 'done') count++;
  }
  const met = count >= needDays || total >= needTotal;
  return { ws, count, total, needDays, needTotal, status: met ? 'done' : end < t ? 'miss' : 'pending' };
}

// Training sessions in a Monday-Sunday week: 4 for the 4-day split (pro-rated in a part week at the start).
const SESSIONS_PER_WEEK = 4;
function sessionsWeek(ws) {
  const t = today();
  const from = ws < chainStart() ? chainStart() : ws;
  const end = addDays(ws, 6);
  const need = Math.min(SESSIONS_PER_WEEK, Math.ceil(SESSIONS_PER_WEEK * (daysBetween(from, end) + 1) / 7));
  let count = 0;
  for (let d = from; d <= end && d <= t; d = addDays(d, 1)) if (workoutsOn(d).length) count++;
  return { ws, count, need, status: count >= need ? 'done' : end < t ? 'miss' : 'pending' };
}
const weekResult = (id, ws) => (id === 'sessions' ? sessionsWeek(ws) : stepsWeek(ws));

function chainStatus(date, id) {
  if (date > today()) return 'off';
  const def = chainDef(id);
  if (def?.custom) {
    // Days clean before the app started count toward the streak (but earn no XP).
    if (def.since && date < def.since) return 'off';
    // Days before the chain was added (or before the clean chains began) are carried in from `since`.
    const carryEnd = def.created && def.created > cleanStart() ? def.created : cleanStart();
    if (date < carryEnd) return def.since ? 'done' : 'off';
  } else if (date < (isClean(def) ? cleanStart() : chainStart())) return 'off';
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
  const def = chainDef(id);
  if (def?.weekly) {
    if (t < chainStart()) return (chainMemo[id] = { cur, best, days, today: 'off', unit: 'wk' });
    let week = null;
    for (let ws = weekStart(chainStart()); ws <= t; ws = addDays(ws, 7)) {
      week = weekResult(id, ws);
      days += week.count;
      if (week.status === 'done') { cur++; best = Math.max(best, cur); } else if (week.status === 'miss') cur = 0;
    }
    return (chainMemo[id] = { cur, best, days, today: week.status, week, unit: 'wk' });
  }
  const from = def?.custom && def.since ? def.since : isClean(def) ? cleanStart() : chainStart();
  for (let d = from; d <= t; d = addDays(d, 1)) {
    const s = chainStatus(d, id);
    if (s === 'done') { cur++; days++; best = Math.max(best, cur); } else if (s === 'miss') cur = 0;
  }
  return (chainMemo[id] = { cur, best, days, today: t >= (isClean(def) ? cleanStart() : chainStart()) ? chainStatus(t, id) : 'off' });
}

// ---- quests ----------------------------------------------------------------
function questAt(date, key) {
  switch (key) {
    case 'steps': return stepsOn(date) >= S.settings.stepGoal ? (S.days[date].stepsAt || atOn(date, '21:00')) : null;
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
  return at ? QUEST_BASE : 0;
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
  Object.keys(S.dayGoals || {}).forEach((d) => set.add(d));
  return [...set].sort();
}

// ---- training analytics ---------------------------------------------------
const e1rm = (kg, reps) => (kg && reps ? kg * (1 + reps / 30) : 0);
const entryBest = (e) => Math.max(0, ...(e.sets || []).map((s) => e1rm(s.kg, s.reps)));
const techOf = (e) => TECHNIQUES.find((t) => t.id === e?.tech) || null;
const logMode = (e) => techOf(e)?.log || 'normal';
const setText = (s) => {
  const kg = s.kg == null ? 'BW' : fmtNum(s.kg);
  if (s.hold != null) return `${kg} kg${s.reps != null ? `×${fmtNum(s.reps)}` : ''} · ${fmtNum(s.hold)} s hold`;
  return s.reps == null ? `${kg} kg` : `${kg}×${fmtNum(s.reps)}`;
};

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
  ['steps1', 'Step Machine', 'Hit the weekly step target', () => chainStreak('steps').best >= 1],
  ['steps4', 'Relentless', 'Weekly step target 4 weeks running', () => chainStreak('steps').best >= 4],
  ['goals7', 'Executor', 'Finish every daily goal on 7 days', () => allDates().filter((d) => goalsFor(d).length && goalsFor(d).every((g) => g.done)).length >= 7],
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
  ['onair', 'On Air', 'Publish your first video', () => S.videos.some((v) => v.status === 'published')],
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
  for (let d = firstStart(); d <= today(); d = addDays(d, 1)) {
    for (const c of allChains()) {
      if (c.custom && c.created && d < c.created) continue; // carried-in days: streak only, no XP
      if (chainStatus(d, c.id) === 'done') add(d, c.pts, `Chain: ${c.name}`, c.stat);
    }
  }
  if (today() >= chainStart()) for (let ws = weekStart(chainStart()); ws <= today(); ws = addDays(ws, 7)) {
    if (stepsWeek(ws).status === 'done') add(ws, PTS.stepsWeek, 'Weekly step target', 'END');
    if (sessionsWeek(ws).status === 'done') add(ws, PTS.sessionsWeek, '4 sessions in a week', 'STR');
  }
  Object.entries(S.days).forEach(([d, r]) => { if (r.sweat) add(d, PTS.sweat, 'Sweat-suit bonus', 'END'); });
  Object.entries(S.days).forEach(([d, r]) => LIFE_AREAS.forEach(([k, name]) => { if (r.life?.[k]) add(d, PTS.life, `A bit for ${name}`, 'MND'); }));
  goalXP(add);
  for (const d of allDates()) if (d >= cleanStart() && d <= today()) { const c = checklistFor(d); if (c.length && c.every((x) => x.done)) add(d, PTS.perfect, 'Perfect day: whole checklist', 'MND'); }
  Object.entries(S.dreams).forEach(([d, x]) => { if (x.text) add(d, PTS.dream, 'Dream diary', 'MND'); });
  S.videos.filter((v) => v.status === 'published').forEach((v) => add(v.date || '', PTS.video, `Video: ${v.title}`, 'MND'));
  Object.entries(S.garmin).forEach(([d, g]) => { if (Object.keys(g).length >= 3) add(d, PTS.garmin, 'Garmin day logged', 'VIT'); });
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

// ---- SMARTENUP goal check ---------------------------------------------------
// Specific, Measurable, Achievable, Relevant, Time-bound, Exciting, Noted, Understood, Positive.
// S, M, T, N, U and P are read from what you write; A, R and E are yours to tick honestly.
const SMARTENUP = [
  ['S', 'Specific', 'Say exactly what you will do. "Film the Day 1 intro" beats "work on the channel".'],
  ['M', 'Measurable', 'Add a number (kg, steps, reps, minutes, pages) or make it clearly done or not done.'],
  ['A', 'Achievable', 'Doable with the time and energy you will actually have. Tick A if it is.'],
  ['R', 'Relevant', 'Moves you towards 77 kg, the channel or a long-term goal. Tick R if it does.'],
  ['T', 'Time-bound', 'Give it a when: a time, or a trigger like "after Meal 1".'],
  ['E', 'Exciting', 'You want to do it, not just should. Tick E if it pulls you.'],
  ['N', 'Noted', 'Written down. Done by putting it here.'],
  ['U', 'Understood', 'Write one line of why, for the moment you don\'t feel like it.'],
  ['P', 'Positive', 'Phrase it as something to do, not to avoid: "Eat Meal 2 by 14:30", not "Don\'t snack".'],
];
const SMART_SELF = ['A', 'R', 'E'];
const VAGUE = /\b(better|more|less|some|stuff|things|try|improve|work on|sort out|get on with|be good)\b/i;
const DONE_VERBS = /\b(finish|complete|film|record|edit|publish|upload|post|send|email|book|call|ring|buy|order|cook|prep|pay|submit|apply|clean|plan|log|weigh|walk|train|read|write|fix|cancel|sign|meal)\w*\b/i;
const WHEN_WORDS = /(\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s?(am|pm)\b|\b(before|after|by|at|morning|noon|lunch|evening|tonight|bedtime)\b)/i;
function smartCheck({ text = '', when = '', why = '', self = {} }) {
  const t = text.trim();
  if (!t) return null;
  const words = t.split(/\s+/).length;
  const hasNum = /\d/.test(t);
  const pass = {
    S: words >= 3 && !(VAGUE.test(t) && !hasNum),
    M: hasNum || DONE_VERBS.test(t),
    A: !!self.A, R: !!self.R, E: !!self.E,
    T: !!when.trim() || WHEN_WORDS.test(t),
    N: true,
    U: why.trim().length >= 3,
    P: !/^\s*(don'?t|do not|no\b|stop|avoid|never|not\b|quit)/i.test(t),
  };
  const score = SMARTENUP.filter(([k]) => pass[k]).length;
  const miss = SMARTENUP.find(([k]) => !pass[k] && !SMART_SELF.includes(k)) || SMARTENUP.find(([k]) => !pass[k]);
  return { pass, score, miss };
}
function smartStrip(r, tap) {
  if (!r) return '<p class="muted small smart-hint">Write it, then make it SMARTENUP.</p>';
  return `<div class="smart" aria-label="SMARTENUP ${r.score} of 9">${SMARTENUP.map(([k, name]) => {
    const on = r.pass[k];
    return SMART_SELF.includes(k) && tap
      ? `<button type="button" class="sl self ${on ? 'on' : ''}" ${tap(k)} aria-pressed="${on}" title="${name}">${k}</button>`
      : `<span class="sl ${on ? 'on' : ''}" title="${name}">${k}</span>`;
  }).join('')}<b class="sl-score ${r.score === 9 ? 'good-text' : ''}">${r.score}/9</b></div>
  <p class="muted small smart-hint">${r.miss ? `<b>${r.miss[0]} · ${r.miss[1]}:</b> ${esc(r.miss[2])}` : '★ Fully SMARTENUP. Now just do it.'}</p>`;
}
// Live update of a strip while typing, without a full re-render.
function refreshSmart(box) {
  const v = (n) => box.querySelector(`[data-sm="${n}"]`)?.value || '';
  const self = {};
  box.querySelectorAll('.sl.self').forEach((b) => { self[b.textContent] = b.classList.contains('on'); });
  const strip = box.querySelector('.smart-wrap');
  if (!strip) return;
  const tapAttrs = box.dataset.smartTap;
  const when = v('when') || (box.dataset.smartWhen === 'week' ? 'this week' : '');
  strip.innerHTML = smartStrip(smartCheck({ text: v('text'), when, why: v('why'), self }), tapAttrs !== undefined ? (k) => `data-act="smart-self" ${tapAttrs} data-l="${k}"` : null);
}

// Tomorrow's top 3 become that day's one-off goals.
function syncTop(d) {
  const p = S.plans[d] || {};
  const keep = (S.dayGoals[d] || []).filter((g) => g.src !== 'plan');
  const old = Object.fromEntries((S.dayGoals[d] || []).filter((g) => g.src === 'plan').map((g) => [g.text, g.done]));
  const top = (p.top || []).map((text, i) => [text, i]).filter(([text]) => text).map(([text, i]) => ({
    id: `top${i}-${d}`, text, cat: 'build', src: 'plan', done: !!old[text],
    when: p.topWhen?.[i] || '', why: p.topWhy?.[i] || '',
    ifThen: i === 0 && p.woop?.obstacle && p.woop?.plan ? `If ${p.woop.obstacle}, then ${p.woop.plan}` : '' }));
  S.dayGoals[d] = [...top, ...keep];
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
// Daily and weekly goals
// ===========================================================================
const GOAL_CATS = [['health', 'Health', 'VIT'], ['wealth', 'Wealth', 'MND'], ['build', 'Build', 'MND'], ['family', 'Family', 'MND'], ['mind', 'Mind', 'MND']];
const catName = (c) => GOAL_CATS.find(([k]) => k === c)?.[1] || 'Mind';
const catStat = (c) => GOAL_CATS.find(([k]) => k === c)?.[2] || 'MND';
const DAILY_SOFT_CAP = 3;

// Recurring daily goals apply from the day they were added; one-offs belong to one date.
function goalsFor(date) {
  const ticks = S.days[date]?.dg || {};
  const rec = S.goalDefs.daily.filter((g) => g.active !== false && (!g.from || g.from <= date))
    .map((g) => ({ ...g, done: !!ticks[g.id], recurring: true }));
  return [...rec, ...(S.dayGoals[date] || []).map((g) => ({ ...g, recurring: false }))];
}

const WEEK_AUTO = {
  sleep7: { label: 'nights of 7 h+ sleep (from your sleep log)', count: (ws) => S.sleep.filter((x) => x.date >= ws && x.date <= addDays(ws, 6) && x.hours >= 7).length },
  sessions: { label: 'training sessions (from Train)', count: (ws) => S.workouts.filter((w) => w.date >= ws && w.date <= addDays(ws, 6)).length },
};
function weeklyFor(ws) {
  const counts = S.weekCounts[ws] || {};
  const rec = S.goalDefs.weekly.filter((g) => g.active !== false && (!g.from || weekStart(g.from) <= ws))
    .map((g) => ({ ...g, recurring: true }));
  return [...rec, ...(S.weekGoals[ws] || []).map((g) => ({ ...g, recurring: false }))].map((g) => {
    const count = g.auto && WEEK_AUTO[g.auto] ? WEEK_AUTO[g.auto].count(ws) : counts[g.id] || 0;
    const target = Math.max(1, g.target || 1);
    return { ...g, count, target, reached: count >= target };
  });
}

function goalXP(add) {
  const dates = new Set([...Object.keys(S.days).filter((d) => S.days[d].dg), ...Object.keys(S.dayGoals)]);
  for (const d of dates) {
    const gs = goalsFor(d);
    const done = gs.filter((g) => g.done);
    done.slice(0, 5).forEach((g) => add(d, PTS.goal1, `Goal: ${g.text}`, catStat(g.cat)));
    if (gs.length && done.length === gs.length) add(d, PTS.goalAll, 'All daily goals done', 'MND');
  }
  const weeks = new Set([...Object.keys(S.weekCounts), ...Object.keys(S.weekGoals)]);
  if (S.goalDefs.weekly.some((g) => g.auto)) for (let ws = weekStart(S.goalDefs.weekly.map((g) => g.from || today()).sort()[0]); ws <= today(); ws = addDays(ws, 7)) weeks.add(ws);
  for (const ws of weeks) for (const g of weeklyFor(ws)) if (g.reached) add(ws, PTS.goalWeek, `Weekly goal: ${g.text}`, catStat(g.cat));
}

// A goal pack travels in a link (#import=...). The part after # never reaches a server,
// so the pack only ever lives in this browser.
// Accepts a full link, the code alone, or raw JSON. Spaces, line breaks and invisible characters
// that copy-paste can add are ignored. Codes starting "z." are gzip-compressed (much shorter).
async function decodePack(text) {
  let t = String(text || '').trim();
  if (t.startsWith('{')) { try { const p = JSON.parse(t); return p?.kind === 'trainer-goals' ? p : null; } catch { return null; } }
  const i = t.indexOf('#import=');
  if (i >= 0) t = t.slice(i + 8);
  const zipped = t.startsWith('z.');
  if (zipped) t = t.slice(2);
  t = t.replace(/[^A-Za-z0-9\-_+/]/g, '').replace(/-/g, '+').replace(/_/g, '/');
  t += '='.repeat((4 - (t.length % 4)) % 4);
  try {
    const bytes = Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
    let json;
    if (zipped) {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      json = await new Response(stream).text();
    } else json = new TextDecoder().decode(bytes);
    const p = JSON.parse(json);
    return p && p.kind === 'trainer-goals' ? p : null;
  } catch { return null; }
}

function applyPack(p) {
  const t = today();
  const merge = (list, items) => {
    for (const it of items || []) {
      const cur = list.find((x) => x.id === it.id);
      const row = { active: true, from: t, ...it };
      if (cur) Object.assign(cur, row, { from: cur.from || t }); else list.push(row);
    }
  };
  merge(S.goalDefs.daily, p.daily);
  merge(S.goalDefs.weekly, p.weekly);
  if (p.principles?.length) S.principles = p.principles;
  // Swap untouched placeholder goals for the pack's own.
  for (const title of p.replace || []) S.goals = S.goals.filter((g) => !(g.title === title && !g.why && !g.milestones.length && !g.doneAt));
  for (const g of p.longterm || []) {
    if (S.goals.some((x) => x.title === g.title)) continue;
    S.goals.push({ id: uid(), area: g.area || 'Goals', title: g.title, main: !!g.main, why: g.why || '', deadline: g.deadline || '', doneAt: null,
      milestones: (g.milestones || []).map((m) => ({ id: uid(), text: m, metric: null, doneAt: null })) });
  }
  // Starting weights: [kg, reps] per set. They only show until you log that exercise yourself.
  for (const b of p.baselines || []) {
    // Keep a newer starting weight you already have (e.g. brought over from Trainer).
    const had = S.baselines[exKey(b.name)];
    if (had?.date && b.date && had.date > b.date) continue;
    S.baselines[exKey(b.name)] = { name: b.name, date: b.date, note: b.note || '', sets: b.sets.map(([kg, reps]) => ({ kg: kg ?? null, reps: reps ?? null })) };
  }
  for (const c of p.chains || []) {
    const cur = S.customChains.find((x) => x.id === c.id);
    if (cur) Object.assign(cur, { name: c.name, since: c.since ?? cur.since }); else S.customChains.push({ active: true, ...c, since: c.since || null, created: today() });
  }
  S.pack = { name: p.name || 'Goal pack', at: new Date().toISOString() };
}

// ===========================================================================
// UI state
// ===========================================================================
const TABS = [['today', 'Today'], ['plan', 'Plan'], ['train', 'Train'], ['fuel', 'Fuel'], ['body', 'Body'], ['hero', 'Hero']];
const SUBTABS = {
  plan: [['tomorrow', 'Tomorrow'], ['week', 'Week'], ['shop', 'Shopping']],
  fuel: [['log', 'Log'], ['recipes', 'Recipes'], ['fluids', 'Fluids'], ['stack', 'Stack']],
  body: [['weight', 'Weight'], ['garmin', 'Garmin'], ['measure', 'Tape'], ['sleep', 'Sleep'], ['guide', 'Guide'], ['settings', 'Setup']],
  hero: [['character', 'Stats'], ['goals', 'Goals'], ['journal', 'Journal'], ['calendar', 'Chains'], ['channel', 'Channel'], ['apps', 'Apps']],
};
const ui = {
  tab: 'today', sub: { plan: 'tomorrow', fuel: 'log', body: 'weight', hero: 'character' },
  fuelDate: null, calDate: null, calChain: 'all', planDate: null, weekStart: null, dayId: null, editProgram: false, drafts: {},
  garminDate: null, goalView: 'today', goalDate: null, goalWeek: null,
  recipeFilter: 'All', recipeQuery: '', openRecipe: null, ingChecks: {}, fluidType: 'water',
  sleepHours: 7.5, sleepQuality: null, openSession: null, openTech: null,
};
try {
  const saved = JSON.parse(sessionStorage.getItem('shtrainer.ui') || '{}');
  if (saved.tab && TABS.some(([k]) => k === saved.tab)) ui.tab = saved.tab;
  if (saved.sub) for (const k of Object.keys(ui.sub)) if (SUBTABS[k].some(([v]) => v === saved.sub[k])) ui.sub[k] = saved.sub[k];
} catch { /* private mode */ }
// A half-logged session survives the phone closing the app mid-workout.
const DRAFTS_KEY = 'shtrainer.drafts';
try { ui.drafts = JSON.parse(localStorage.getItem(DRAFTS_KEY)) || {}; } catch { ui.drafts = {}; }
const saveDrafts = () => { try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(ui.drafts)); } catch { /* ignore */ } };
const rememberUi = () => { try { sessionStorage.setItem('shtrainer.ui', JSON.stringify({ tab: ui.tab, sub: ui.sub })); } catch { /* ignore */ } };

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
  const pts = at ? `+${questPoints(date, key)}` : `${QUEST_BASE}`;
  const sub = key === 'steps' && stepsOn(date) ? `${stepsOn(date).toLocaleString('en-GB')} / ${S.settings.stepGoal.toLocaleString('en-GB')}${at ? ' · done' : ''}` : at ? `Done ${fmtTime(at)}` : q.note;
  return `<button class="quest ${at ? 'done' : ''}" data-act="quest" data-key="${key}" aria-pressed="${!!at}">
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
  const d = today(), mode = eatMode(d), meals = mealsOn(d);
  const modeLine = mode === 'fast'
    ? (meals.length ? '<p class="small bad-text">Food logged on a fast day: the fasting chain is broken. Switch to 18:6 or One meal if that was the plan.</p>' : '<p class="small"><b>Fast day.</b> Water, tea and electrolytes only. Diet, cut, fasting and protein chains all count it.</p>')
    : mode === 'omad'
      ? `<p class="small"><b>One meal today</b>, any time, in one sitting (everything within ${OMAD_SITTING_MIN / 60} hours of the first bite).${meals.length ? ` Eaten at ${fmtTime(meals[0].at)}${mealTimingOk(d) ? ' · ✓ fasting chain kept' : ' · second sitting: fasting chain broken'}.` : ''}</p>`
      : '';
  return `<section class="card fastcard">
    <h2>Eating today <span class="right">${mode === 'window' ? `${esc(win().from)}–${esc(win().to)}` : ''}</span></h2>
    ${segmented('eat-mode', EAT_MODES, mode, 'How you are eating today', `data-date="${d}"`)}
    ${modeLine}
    ${mode === 'fast' && !meals.length ? '' : `${head}<p class="small">${mode === 'omad' ? 'The window doesn\'t apply today.' : line}</p>`}
    <button data-act="fast-start">Start an extended fast</button>
  </section>`;
}

// "Day N" for abstinence chains: today counts as a day unless you've slipped today.
const dayNumber = (st) => (st.today === 'miss' ? 0 : st.cur + (st.today === 'pending' ? 1 : 0));
const dayBadge = (st) => { const n = dayNumber(st); return `<span class="daybadge ${n ? '' : 'zero'}" aria-label="Day ${n}"><small>Day</small>${n}</span>`; };

function chainRow(c) {
  const st = chainStreak(c.id);
  const s = st.today;
  const action = { diet: 'go-fuel', cut: 'go-fuel', fasting: 'go-fuel', protein: 'go-fuel', training: 'go-train', sleep: 'go-sleep', plan: 'go-plan' }[c.id];
  const flame = `<span class="flame ${st.cur ? 'lit' : ''}" aria-label="${st.cur} ${st.unit === 'wk' ? 'week' : 'day'} chain">${st.cur}${st.unit === 'wk' ? '<small>wk</small>' : ''}</span>`;
  if (c.id === 'steps') {
    const w = st.week, d = today(), n = stepsOn(d), sweat = !!S.days[d]?.sweat;
    const fmt = (x) => x.toLocaleString('en-GB');
    return `<div class="chain ${s}">
      <div class="row between"><span class="grow"><b>${STATUS_ICON[s] ? `<span class="st ${s}">${STATUS_ICON[s]}</span> ` : ''}Steps this week</b><br>
        <span class="muted small">${w.count}/${w.needDays} days at ${fmt(S.settings.stepGoal)} · ${fmt(w.total)} / ${fmt(w.needTotal)} total${s === 'done' ? ' · week won' : ''} · best ${st.best} wk</span></span>${flame}</div>
      ${bar(Math.max(w.count / w.needDays, w.total / w.needTotal) * 100, 100, s === 'done' ? 'good' : '')}
      <div class="grid2"><button data-act="steps-open" data-date="${d}">${n ? `Today ${fmt(n)}` : '+ Enter steps'}</button>
      <button class="${sweat ? 'primary' : ''}" data-act="sweat" aria-pressed="${sweat}">${sweat ? '✓ Sweat suit +' + PTS.sweat : 'Sweat suit (bonus)'}</button></div></div>`;
  }
  if (c.id === 'sessions') {
    const w = st.week;
    return `<div class="chain ${s}">
      <div class="row between"><span class="grow"><b>${STATUS_ICON[s] ? `<span class="st ${s}">${STATUS_ICON[s]}</span> ` : ''}Sessions this week</b><br>
        <span class="muted small">${w.count}/${w.need} done${s === 'done' ? ' · week won' : ''} · best ${st.best} wk · +${PTS.sessionsWeek} XP a week</span></span>${flame}</div>
      ${bar(w.count, w.need, s === 'done' ? 'good' : '')}
      <button data-act="go-train">${workoutsOn(today()).length ? '✓ Trained today' : 'Go to today\'s session'}</button></div>`;
  }
  const sl = c.id === 'sleep' ? sleepOn(today()) : null;
  const cutNote = c.id === 'cut' && s === 'pending' ? CUT_REFS.map((r, i) => `Meal ${i + 1} ${mealsOn(today()).some((m) => m.ref === r) ? '✓' : '—'}`).join(' · ') : '';
  const note = cutNote ? cutNote : s === 'miss' && c.id === 'cut' ? 'Something off the Gironda plan today: start again tomorrow' : sl ? `${sl.hours} h last night${s === 'miss' ? ': start again tonight' : ''}` : s === 'done' ? 'Kept today' : s === 'miss' ? 'Broken today: start again tomorrow' : c.id === 'diet' && mealsOn(today()).length ? (isRefeed(today()) ? 'Carb-up day: just finish inside the window' : 'On track: finish inside the window') : c.desc;
  if (c.custom) {
    const since = c.since ? daysBetween(c.since, today()) + (s === 'done' ? 1 : 0) : null;
    return `<div class="chain ${s}">
      <div class="row between"><span class="grow"><b>${esc(c.name)}</b><br><span class="muted small">${c.since ? `Clean since ${fmtDate(c.since)}` : 'Set the date you stopped in Hero → Chains'} · best ${st.best}</span></span>${dayBadge(st)}</div>
      ${milestoneNote(dayNumber(st))}
      <div class="grid2"><button class="${s === 'done' ? 'primary' : ''}" data-act="clean" data-chain="${esc(c.id)}" data-v="1" aria-pressed="${s === 'done'}">✓ Clean today</button>
      <button class="${s === 'miss' ? 'danger' : ''}" data-act="clean" data-chain="${esc(c.id)}" data-v="0" aria-pressed="${s === 'miss'}">I slipped</button></div></div>`;
  }
  if (c.id === 'coffee') {
    return `<div class="chain ${s}">
      <div class="row between"><span class="grow"><b>${c.name}</b><br><span class="muted small">${s === 'pending' ? 'Keeps counting unless you tap I had coffee.' : esc(note)} · best ${st.best}</span></span>${dayBadge(st)}</div>
      <div class="grid2"><button class="${s === 'done' ? 'primary' : ''}" data-act="coffee" data-v="1" aria-pressed="${s === 'done'}">✓ Coffee-free today</button>
      <button class="${s === 'miss' ? 'danger' : ''}" data-act="coffee" data-v="0" aria-pressed="${s === 'miss'}">I had coffee</button></div></div>`;
  }
  if (FOOD_CHAINS.includes(c.id)) {
    const o = S.days[today()]?.chains?.[c.id];
    const mode = eatMode(today());
    const why = s === 'pending' ? (mode === 'fast' ? 'Fast day: counts once the window has passed with nothing eaten' : mode === 'omad' ? 'One meal today, one sitting, any time' : 'Counts itself unless you tap I broke it') : note;
    return `<div class="chain ${s}">
      <button class="linkish" data-act="${action}"><span class="row between"><span class="grow"><b>${STATUS_ICON[s] ? `<span class="st ${s}">${STATUS_ICON[s]}</span> ` : ''}${c.name}</b><br><span class="muted small">${esc(why)} · best ${st.best}</span></span>${flame}</span></button>
      <div class="grid2"><button class="${o === true ? 'primary' : ''}" data-act="chain-mark" data-chain="${c.id}" data-v="1" aria-pressed="${o === true}">✓ Kept</button>
      <button class="${o === false ? 'danger' : ''}" data-act="chain-mark" data-chain="${c.id}" data-v="0" aria-pressed="${o === false}">I broke it</button></div></div>`;
  }
  return `<button class="chain linkish ${s}" data-act="${action}">
    <span class="row between"><span class="grow"><b>${STATUS_ICON[s] ? `<span class="st ${s}">${STATUS_ICON[s]}</span> ` : ''}${c.name}</b><br><span class="muted small">${esc(note)} · best ${st.best}</span></span>${flame}</span></button>`;
}

const CLEAN_MILESTONES = [7, 14, 30, 60, 90, 100, 180, 365, 500, 1000];
function milestoneNote(n) {
  if (!n) return '<p class="muted small">Day 1 starts tomorrow.</p>';
  const next = CLEAN_MILESTONES.find((m) => m > n);
  const hit = CLEAN_MILESTONES.includes(n);
  if (hit) return `<p class="small good-text">★ Day ${n}. Milestone reached.</p>`;
  return next ? `<p class="muted small">${next - n} day${next - n === 1 ? '' : 's'} to ${next}</p>` : '';
}

function coffeeSupport() {
  const st = chainStreak('coffee');
  const t = today();
  const dayNo = t < cleanStart() ? 0 : st.cur + (st.today === 'pending' ? 1 : 0);
  const tip = [...COFFEE_TIPS].reverse().find(([n]) => n === dayNo) || (dayNo <= 3 && dayNo > 0 ? COFFEE_TIPS[Math.min(dayNo, 3) - 1] : null);
  if (!tip) return '';
  return `<section class="card support"><h2>No-coffee chain · ${esc(tip[1])}</h2><p>${esc(tip[2])}</p></section>`;
}

function lifeCard(d) {
  const r = S.days[d]?.life || {};
  const next = S.videos.filter((v) => v.status !== 'published').sort((a, b) => (a.date || '9').localeCompare(b.date || '9'))[0];
  return `<section class="card">
    <h2>A little for everything else <span class="right">+${PTS.life} XP each</span></h2>
    <div class="list">${LIFE_AREAS.map(([k, name, hint]) => `<button class="check" role="checkbox" aria-checked="${!!r[k]}" data-act="life" data-k="${k}"><span class="box" aria-hidden="true">${r[k] ? '✓' : ''}</span>
      <span><b>${esc(name)}</b><br><span class="muted small">${k === 'youtube' && next ? `Next video: ${esc(next.title)} (${esc(VIDEO_STATUS.find(([x]) => x === next.status)?.[1] || next.status)})` : esc(hint)}</span></span></button>`).join('')}</div>
    <div class="grid2"><button class="small-btn" data-act="go-channel">Channel</button><button class="small-btn" data-act="go-goals" data-v="today">Goals</button></div>
  </section>`;
}

// When the 4-week cycle ends, offer next month's Mentzer HIT block.
const cycleEnd = () => addDays(S.settings.cycleStart, 28);
function mentzerCard() {
  const st = S.settings;
  if (st.family !== 'cycle') return '';
  const t = today();
  if (t < cycleEnd()) return cycleWeek() === 4 ? `<section class="card slim"><p class="small"><b>Last week of the 4-week programme.</b> Mike Mentzer HIT takes over on ${fmtDate(cycleEnd())}.</p></section>` : '';
  if (st.mentzerSnooze && t < addDays(st.mentzerSnooze, 7)) return '';
  return `<section class="card alert">
    <h2>4 weeks done: Mentzer next</h2>
    <p class="small">The 4-week programme finished on ${fmtDate(addDays(cycleEnd(), -1))}. Next month is Mike Mentzer's Heavy Duty: one all-out set per exercise, more rest between sessions. It suits a deep cut: less volume to recover from.</p>
    <p class="muted small">Your weights carry over. Start the HIT weights at about 80–90% of your best 8-rep set and go to failure.</p>
    <button class="primary" data-act="go-mentzer">Switch to Mentzer HIT</button>
    <div class="grid2"><button data-act="cycle-again">Run the 4 weeks again</button><button data-act="mentzer-later">Remind me next week</button></div>
  </section>`;
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
  { const done = stepsOn(d) >= S.settings.stepGoal; items.push(`<button class="check" role="checkbox" aria-checked="${done}" data-act="steps-open" data-date="${d}"><span class="box" aria-hidden="true">${done ? '✓' : ''}</span><span>${S.settings.stepGoal.toLocaleString('en-GB')} steps</span></button>`); }
  if (p.sweat) { const done = !!S.days[d]?.sweat; items.push(`<button class="check" role="checkbox" aria-checked="${done}" data-act="sweat"><span class="box" aria-hidden="true">${done ? '✓' : ''}</span><span>Sweat-suit walk (bonus)</span></button>`); }
  for (const [slot, id] of plannedMeals(d)) {
    const f = findFood(id);
    const done = !!slotLogged(d, slot, id);
    items.push(`<button class="check" role="checkbox" aria-checked="${done}" data-act="log-planned" data-slot="${slot}" data-id="${esc(id)}"><span class="box" aria-hidden="true">${done ? '✓' : ''}</span><span>${slot}: ${esc(f.name)}${done ? '' : ' <span class="muted small">· tap to log</span>'}</span></button>`);
  }
  if (!items.length) return '';
  return `<section class="card"><h2>Today's plan <span class="right">${kind ? esc(DAY_KINDS.find(([k]) => k === kind)[1]) + ' day' : ''}</span></h2><div class="list">${items.join('')}</div></section>`;
}

function todayGoalsCard(d) {
  const gs = goalsFor(d);
  const wk = weeklyFor(weekStart(d));
  if (!gs.length && !wk.length) return `<section class="card slim"><p class="small">No daily or weekly goals yet. <button class="linkish inline" data-act="go-goals" data-v="today">Add goals</button></p></section>`;
  const done = gs.filter((g) => g.done).length;
  return `<section class="card">
    <h2>Goals <span class="right">${gs.length ? `${done}/${gs.length} today` : ''}</span></h2>
    ${gs.length ? `<div class="list">${gs.map((g) => goalRow(d, g)).join('')}</div>` : ''}
    ${wk.length ? `<p class="rlabel">This week</p><div class="list">${wk.map((g) => `<div class="row between"><span class="grow small">${esc(g.text)} <b class="${g.reached ? 'good-text' : ''}">${g.count}/${g.target}</b></span>${g.auto || g.reached ? '' : `<button class="small-btn" data-act="wg-inc" data-ws="${weekStart(d)}" data-id="${esc(g.id)}" data-d="1">+1</button>`}</div>`).join('')}</div>` : ''}
    <button class="ghost small-btn" data-act="go-goals" data-v="today">Add or change goals</button>
  </section>`;
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
    ['All day', `${S.settings.stepGoal.toLocaleString('en-GB')} steps (sweat suit is a bonus)`],
    [w.from, 'Eating window opens: first meal'],
    [`${w.from}–${w.to}`, 'Train in or just before the window'],
    [w.to, 'Last meal done: window closes'],
    ['Evening', 'Plan tomorrow, gratitude journal'],
    ['22:30', 'Lights out target'],
  ];
}

// ===========================================================================
// Daily checklist: every daily task in one tickable list
// ===========================================================================
// ---- the cut: carb-up clock, check-in, red flags, weekly decision -----------
// Gironda's carb-up: one day at about maintenance every 72-96 hours, carbs 200-300 g, protein the same, fat low.
// A carb-up day is stored as days[date].refeed, so the diet and cut chains treat it as on plan.
const REFEED_CARBS = 200;
const isRefeed = (date) => !!S.days[date]?.refeed;
function lastRefeed(d) {
  return Object.keys(S.days).filter((k) => k <= d && S.days[k]?.refeed).sort().pop() || null;
}
function carbupClock(d = today()) {
  const last = lastRefeed(addDays(d, -1));
  const from = last || addDays(chainStart(), -1);
  const fromMs = parseDate(from).getTime() + 12 * 3600000;
  const ref = d === today() ? Date.now() : parseDate(d).getTime() + 12 * 3600000;
  const hrs = Math.max(0, (ref - fromMs) / 3600000);
  const every = S.settings.carbupHours || 96;
  return { last, hours: hrs, every, due: hrs >= every - 12, frac: Math.min(1, hrs / every), next: addDays(from, Math.round(every / 24)) };
}
function nextTrainingDay(from) {
  for (let i = 0; i < 7; i++) { const x = addDays(from, i); if (planKind(x) === 'train') return x; }
  return null;
}
function refeedCard(d) {
  if (d < chainStart()) return '';
  const st = S.settings;
  if (isRefeed(d)) {
    return `<section class="card refeed">
      <h2>Carb-up day <span class="right">every ${st.carbupHours} h</span></h2>
      <p class="small">Carbs ${REFEED_CARBS}–300 g from rice, potatoes, oats or fruit. Protein stays at ${st.proteinGoal} g, fat low (40–50 g). Calories about maintenance, so the diet chain only checks the window today. Planned to the gram: not a cheat day.</p>
      <p class="muted small">Expect 0.5–1.5 kg on the scale tomorrow. It's glycogen and water, gone in 2–3 days.</p>
      <button data-act="refeed" data-date="${d}">Undo carb-up day</button>
    </section>`;
  }
  const c = carbupClock(d);
  const ring = (f) => { const a = 2 * Math.PI * 26; return `<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--raised)" stroke-width="7"/><circle cx="32" cy="32" r="26" fill="none" stroke="var(--brass)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${a * f} ${a}" transform="rotate(-90 32 32)"/></svg>`; };
  const nt = nextTrainingDay(d);
  return `<section class="card ${c.due ? 'refeed' : ''}">
    <h2>Carb-up clock <span class="right">every ${c.every} h</span></h2>
    <div class="row">${ring(c.frac)}<div class="grow">
      ${c.due ? `<p><b>Carb-up due.</b> ${Math.round(c.hours)} h since ${c.last ? fmtDate(c.last) : 'the start'}.</p><p class="muted small">${planKind(d) === 'train' ? 'Today is a training day: a good day for it.' : nt ? `Best on a training day: next is ${fmtDate(nt)}.` : 'Best on a training day, ideally legs.'}</p>`
        : `<p><b>${Math.round(c.every - c.hours)} h</b> to the next carb-up (around ${fmtDate(c.next)}).</p><p class="muted small">Last: ${c.last ? fmtDate(c.last) : 'none yet'}. Flat in the gym, lifts down two sessions running or a stalled scale? Carb-up sooner.</p>`}
    </div></div>
    ${c.due ? `<button class="primary" data-act="refeed" data-date="${d}">Today is a carb-up day</button>` : `<button class="small-btn" data-act="refeed" data-date="${d}">Carb-up today instead</button>`}
  </section>`;
}

// Weight and sleep in one place, straight from Today.
function quickLogCard(d) {
  const w = S.weights.find((x) => x.date === d), sl = sleepOn(d), lw = latestWeight();
  return `<section class="card">
    <h2>Log <span class="right">${w ? `✓ ${w.kg} kg` : 'weigh in'} · ${sl ? `✓ ${sl.hours} h sleep` : 'sleep'}</span></h2>
    <form id="quick-log" class="grid2" autocomplete="off">
      <label class="field">Weight (kg)<input name="kg" inputmode="decimal" placeholder="${lw ? lw.kg : ''}" value="${w ? w.kg : ''}"></label>
      <label class="field">Sleep last night (h)<input name="hours" inputmode="decimal" placeholder="${S.settings.sleepGoal}" value="${sl ? sl.hours : ''}"></label>
      <button class="primary" style="grid-column:1/-1" type="submit">Save</button>
    </form>
  </section>`;
}

// Symptoms. Red ones (index into RED_FLAGS) put advice at the top of Today.
const RED_FLAGS = [
  ['Severe or persistent abdominal pain (may spread to the back)', 'Stop and get urgent medical help (NHS 111, or 999 if severe).'],
  ['Repeated vomiting or unable to keep fluids down', 'Get medical advice today (NHS 111).'],
  ['Fainting, chest pain or a racing or irregular heartbeat', 'Call 999.'],
  ['Yellow skin or eyes, or pain under the right ribs after fatty meals', 'See a GP promptly (possible gallbladder problem).'],
  ['Dizziness on standing, very dark urine or not passing urine', 'Rehydrate and get medical advice.'],
  ['No bowel movement for 4+ days with pain or bloating', 'Speak to a pharmacist or GP.'],
];
const SYMPTOMS = [
  ['nausea', 'Nausea', -1], ['constipation', 'Constipation', -1], ['reflux', 'Reflux', -1], ['headache', 'Headache', -1], ['tired', 'Very tired', -1], ['noappetite', 'No appetite', -1],
  ['abdo', 'Severe tummy pain', 0], ['vomit', 'Repeated vomiting', 1], ['heart', 'Faint / chest pain / racing heart', 2], ['jaundice', 'Yellow skin or eyes', 3], ['dizzy', 'Dizzy / dark urine', 4], ['nobm', 'No bowel movement 4+ days', 5],
];
function redFlagCard(d) {
  const reds = (S.days[d]?.symptoms || []).map((id) => SYMPTOMS.find((x) => x[0] === id)).filter((x) => x && x[2] >= 0);
  if (!reds.length) return '';
  return `<section class="card alert"><h2 class="danger">Get medical advice</h2>${reds.map((x) => `<p class="small"><b>${esc(RED_FLAGS[x[2]][0])}.</b> ${esc(RED_FLAGS[x[2]][1])}</p>`).join('')}
    <p class="muted small">Stop the diet and any medication changes until you've spoken to a clinician.</p></section>`;
}
function cutCheckinCard(d) {
  const r = S.days[d] || {};
  const sc = (k) => segmented('rate', [1, 2, 3, 4, 5].map((n) => [n, String(n)]), r[k] ?? '', k, `data-k="${k}" data-date="${d}"`);
  return `<section class="card">
    <h2>Cut check-in <span class="right">10 seconds</span></h2>
    <div class="grid2"><div><span class="muted small">Hunger (1 low – 5 high)</span>${sc('hunger')}</div><div><span class="muted small">Energy (1 low – 5 high)</span>${sc('energy')}</div></div>
    <div><span class="muted small">Symptoms</span><div class="row wrap">${SYMPTOMS.map(([id, l, red]) => `<button class="small-btn ${red >= 0 ? 'redflag' : ''}" data-act="symptom" data-v="${id}" data-date="${d}" aria-pressed="${(r.symptoms || []).includes(id)}">${esc(l)}</button>`).join('')}</div></div>
    <label class="field">Medication taken (your record only)<input id="cut-med" data-date="${d}" value="${esc(r.med || '')}" placeholder="Name and what you took"></label>
    <p class="muted small">This app records medication and symptoms. It never suggests doses, timing or sources: that's for a clinician.</p>
  </section>`;
}

// Weekly decision (the Shredded System rules), judged on 14 days of data, one change at a time.
const KCAL_FLOOR = 1500;
function avgBetween(from, to) { const w = S.weights.filter((x) => x.date >= from && x.date <= to).map((x) => Number(x.kg)); return w.length ? { kg: w.reduce((a, b) => a + b, 0) / w.length, n: w.length } : null; }
function weekTrend(end = today()) {
  const cur = avgBetween(addDays(end, -6), end), prev = avgBetween(addDays(end, -13), addDays(end, -7));
  return { cur, prev, rate: cur && prev && cur.n >= 3 && prev.n >= 3 ? ((prev.kg - cur.kg) / prev.kg) * 100 : null };
}
function cutDecision() {
  const t = today();
  const days = []; for (let i = 0; i < 14; i++) days.push(addDays(t, -i));
  const hasWeight = new Set(S.weights.map((x) => x.date));
  const logged = (d) => mealsOn(d).length > 0 || isFastDay(d);
  const records = days.filter((d) => hasWeight.has(d) && logged(d)).length;
  const judged = days.filter((d) => d < t && d >= chainStart()).map((d) => chainStatus(d, 'cut')).filter((x) => x === 'done' || x === 'miss');
  const adh = judged.length ? (judged.filter((x) => x === 'done').length / judged.length) * 100 : null;
  const waists = [...S.measurements].filter((m) => m.waist != null).sort((a, b) => a.date.localeCompare(b.date));
  const lastW = waists[waists.length - 1], baseW = lastW && waists.filter((m) => daysBetween(m.date, lastW.date) >= 10).pop();
  const waist = baseW ? lastW.waist - baseW.waist : null;
  const score = (w) => (w.entries || []).reduce((sum, e) => sum + Math.max(0, ...(e.sets || []).map((x) => (x.kg && x.reps ? x.kg * (1 + x.reps / 30) : 0))), 0);
  const byDay = {};
  for (const w of [...S.workouts].sort((a, b) => a.date.localeCompare(b.date))) (byDay[`${w.programId}:${w.dayId}`] ||= []).push(score(w));
  const strength = Object.values(byDay).some((xs) => { const l = xs.slice(-3); return l.length === 3 && l[2] < l[1] && l[1] < l[0] && l[0] > 0; });
  const en = days.slice(0, 7).map((d) => S.days[d]?.energy).filter(Boolean);
  const tired = en.length >= 3 && en.reduce((a, b) => a + b, 0) / en.length <= 2;
  const rate = weekTrend().rate;
  const ctx = { records, rate, adh, waist, strength, tired };
  let r;
  if (records < 12 || rate == null) r = ['Keep logging', `No change yet: ${records} of 12 complete days (weigh-in plus food or a fast day) in the last 14.`, 0, 'muted'];
  else if (strength) r = ['Review recovery', 'Lifts fell two sessions running. Check sleep and deficit; add 100–150 kcal or bring the next carb-up forward.', 150, 'bad'];
  else if (rate > 1 && tired) r = ['Slow down', 'Losing over 1% a week and tired. Add 100–200 kcal (carbs on training days).', 150, 'bad'];
  else if (rate > 1) r = ['Fast but fine', 'Over 1% a week. No change while strength and energy hold; early weeks include water.', 0, 'warn'];
  else if (rate >= 0.5) r = ['On track', 'No change.', 0, 'good'];
  else if (rate >= 0.3) r = ['Slow but acceptable', 'No change. Losses slow as you get leaner.', 0, 'good'];
  else if (waist != null && waist <= -0.5) r = ['Hold', 'Weight stuck but waist shrinking. Hold another week.', 0, 'warn'];
  else if (adh != null && adh < 85) r = ['Tighten execution', 'Don\'t cut calories. Keep the cut-day chain on 6 days of 7 first.', 0, 'warn'];
  else r = ['Small cut', 'Remove 100–150 kcal or add about 1,500 steps a day. One change only.', -125, 'warn'];
  return { decision: r[0], action: r[1], change: r[2], tone: r[3], ctx };
}
function decisionCard() {
  const x = cutDecision(), c = x.ctx;
  const row = (l, v, cls = '') => `<div class="row between small"><span>${l}</span><b class="${cls}">${v}</b></div>`;
  return `<section class="card">
    <h2>This week's decision</h2>
    <div class="verdict ${x.tone}"><b>${esc(x.decision)}</b><span class="small">${esc(x.action)}</span></div>
    ${row('Complete days (last 14)', `${c.records} / 12`, c.records >= 12 ? 'good-t' : '')}
    ${row('Rate', c.rate == null ? 'needs 2 weeks of weigh-ins' : `${round1(c.rate)}% a week`)}
    ${row('Cut-day chain kept', c.adh == null ? '—' : `${Math.round(c.adh)}%`)}
    ${row('Waist change', c.waist == null ? '—' : `${c.waist > 0 ? '+' : ''}${round1(c.waist)} cm`)}
    ${row('Strength', c.strength ? 'down twice' : S.workouts.length ? 'holding' : '—', c.strength ? 'bad-t' : '')}
    ${row('Energy', c.tired ? 'low' : 'ok', c.tired ? 'bad-t' : '')}
    ${x.change ? `<button data-act="apply-kcal" data-v="${x.change}">Apply: ${x.change > 0 ? '+' : ''}${x.change} kcal (target now ${S.settings.kcalGoal})</button>` : ''}
    <p class="muted small">Weigh daily, waist weekly in Tape. Rate a week as 0.5–1% of bodyweight.</p>
  </section>`;
}
function timelineCard() {
  const tr = weekTrend();
  const lw = latestWeight();
  const cur = tr.cur ? tr.cur.kg : lw ? Number(lw.kg) : S.settings.startWeight;
  const base = tr.rate && tr.rate > 0.2 ? Math.min(tr.rate, 1) : 0.8;
  const goals = [90, 85, 80, S.settings.target, 72.5, S.settings.goalLow].filter((g, i, a) => g < cur && a.indexOf(g) === i).sort((a, b) => b - a);
  const marks = {};
  let w = cur, wk = 0;
  while (goals.length && w > goals[goals.length - 1] && wk < 150) { const r = w > 85 ? base : w > 78 ? base * 0.8 : base * 0.6; w -= (w * r) / 100; wk++; for (const g of goals) if (w <= g && !marks[g]) marks[g] = wk; }
  if (!goals.length) return '';
  return `<section class="card"><h2>Timeline <span class="right">${round1(base)}%/wk, easing off</span></h2>
    <div class="list">${goals.map((g) => marks[g] ? `<div class="row between small"><span>${g === S.settings.target || g === S.settings.goalLow ? `<b>${g} kg</b>` : `${g} kg`}</span><span>${marks[g]} wk · ${fmtDate(addDays(today(), marks[g] * 7))}</span></div>` : '').join('')}</div>
    <p class="muted small">Add 2 weeks for each diet break. At ${S.settings.target} kg, judge photos, waist and strength before going for ${S.settings.goalLow}.</p></section>`;
}

// Progress photos (photos.js, IndexedDB). First and latest of each pose side by side.
let photoUrls = [];
function photosCard() {
  return `<section class="card" id="photos-card"><h2>Photos <span class="right">every 4 weeks</span></h2>
    <div class="grid3">${['front', 'side', 'back'].map((pose) => `<label class="btn">+ ${pose[0].toUpperCase() + pose.slice(1)}<input type="file" accept="image/*" capture="environment" class="sr photo-in" data-pose="${pose}"></label>`).join('')}</div>
    <div id="photo-grid"><p class="muted small">Loading…</p></div>
    <p class="muted small">Same light, same place. Photos stay on this phone and aren't in backups.</p></section>`;
}
async function fillPhotos() {
  const grid = document.getElementById('photo-grid');
  if (!grid) return;
  let all;
  try { all = (await Photos.all()).filter((p) => p.pose !== 'background'); } catch { grid.innerHTML = '<p class="muted small">Photos aren\'t available in this browser.</p>'; return; }
  if (!document.getElementById('photo-grid')) return;
  for (const u of photoUrls) URL.revokeObjectURL(u);
  photoUrls = [];
  if (!all.length) { grid.innerHTML = '<p class="muted small">No photos yet.</p>'; return; }
  const img = (p) => { const u = URL.createObjectURL(p.blob); photoUrls.push(u); return `<figure><img src="${u}" alt="${p.pose} photo, ${fmtDate(p.date)}"><figcaption>${fmtDate(p.date)} <button class="icon ghost" data-act="photo-del" data-id="${esc(p.id)}" aria-label="Delete ${p.pose} photo from ${fmtDate(p.date)}">✕</button></figcaption></figure>`; };
  grid.innerHTML = ['front', 'side', 'back'].map((pose) => {
    const ps = all.filter((p) => p.pose === pose).sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at));
    if (!ps.length) return '';
    const f = ps[0], l = ps[ps.length - 1];
    return `<div class="photo-row"><b class="small">${pose[0].toUpperCase() + pose.slice(1)}${ps.length > 1 ? ` <span class="muted">· ${daysBetween(f.date, l.date)} days apart</span>` : ''}</b><div class="pair">${img(f)}${f !== l ? img(l) : ''}</div></div>`;
  }).join('');
}

// Barcode scanning (scan.js) into the food log.
let scanState = null;
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
    ${sc.msg ? `<p class="small ${sc.status === 'error' ? 'warn-t' : 'muted'}">${esc(sc.msg)}</p>` : ''}
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

// Copy all of Trainer's data in, keeping the cut set-up.
function bringTrainer() {
  let t = null;
  try { t = JSON.parse(localStorage.getItem(TRAINER_KEY)); } catch { t = null; }
  if (!t || typeof t !== 'object' || !t.settings) { toast('No Trainer data found in this browser'); return; }
  const keep = { background: S.settings.background, bgPhotoId: S.settings.bgPhotoId };
  const n = normalise(JSON.parse(JSON.stringify(t)));
  Object.assign(n.settings, keep, { family: 'cycle', active: { ...n.settings.active, cycle: 'my4week' }, target: Math.min(Number(n.settings.target) || 75, 75), goalLow: 70, carbupHours: n.settings.carbupHours || 96 });
  n.notice = null;
  S = n;
  toast(`Brought over ${S.weights.length} weigh-ins, ${S.workouts.length} sessions and ${S.meals.length} meals. Trainer is unchanged.`);
}

// Chain summary for the home page (eddie144-ai.github.io). Written only when it changes.
let lastSummary = '';
function writeChainSummary() {
  if (today() < cleanStart()) return;
  const chains = allChains().map((c) => { const st = chainStreak(c.id); return { id: c.id, name: c.name, day: c.weekly ? st.cur : dayNumber(st), best: st.best, today: st.today, unit: c.weekly ? 'wk' : 'day' }; });
  const body = JSON.stringify(chains);
  if (body === lastSummary) return;
  lastSummary = body;
  try { localStorage.setItem(CHAINS_KEY, JSON.stringify({ v: 1, at: new Date().toISOString(), date: today(), chains })); } catch { /* storage full or blocked */ }
}

// Background photo: Gironda (default), your own photo (kept in the photos database on this phone) or none.
let bgUrl = null, bgFor = null;
async function applyBackground() {
  const st = S.settings;
  const key = `${st.background}:${st.bgPhotoId || ''}`;
  if (key === bgFor) return;
  bgFor = key;
  const root = document.documentElement;
  if (bgUrl) { URL.revokeObjectURL(bgUrl); bgUrl = null; }
  if (st.background === 'gironda') { root.style.setProperty('--bg-photo', `url("${GIRONDA_PHOTO}")`); root.dataset.bg = 'photo'; return; }
  if (st.background === 'mine' && st.bgPhotoId) {
    try {
      const p = (await Photos.all()).find((x) => x.id === st.bgPhotoId);
      if (p && bgFor === key) { bgUrl = URL.createObjectURL(p.blob); root.style.setProperty('--bg-photo', `url("${bgUrl}")`); root.dataset.bg = 'photo'; return; }
    } catch { /* fall through */ }
  }
  root.style.removeProperty('--bg-photo');
  root.dataset.bg = 'none';
}

// Calendar file: daily weigh-in, carb-ups for 12 weeks, training days.
function carbupDatesAhead(weeks = 12) {
  const c = carbupClock();
  const step = Math.max(1, Math.round(c.every / 24));
  let d = c.due ? today() : c.next;
  if (d < chainStart()) d = chainStart();
  const out = [], end = addDays(today(), weeks * 7);
  for (; d <= end; d = addDays(d, step)) out.push(d);
  return out;
}
function downloadText(name, text, type) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function checklistFor(d) {
  const st = S.settings;
  const mac = macrosOn(d);
  const kind = planKind(d);
  const items = [];
  const chainItem = (c) => items.push({ k: `chain:${c.id}`, label: c.name, done: chainStatus(d, c.id) === 'done', sub: c.since || c.id === 'coffee' ? `Day ${dayNumber(chainStreak(c.id))}` : '' });
  // Morning first: weigh in daily; tape measurements on day 1 and every Monday.
  const w = S.weights.find((x) => x.date === d);
  const prevW = [...S.weights].filter((x) => x.date < d).sort((a, b) => a.date.localeCompare(b.date)).pop();
  items.push({ k: 'weigh', label: 'Weigh in', done: !!w, sub: w ? `${w.kg} kg${prevW ? ` · ${round1(w.kg - prevW.kg) > 0 ? '+' : ''}${round1(w.kg - prevW.kg)} vs ${fmtDate(prevW.date)}` : ''}` : 'after the toilet, before food or drink' });
  if (measureDay(d)) {
    const m = S.measurements.find((x) => x.date === d);
    items.push({ k: 'measure', label: 'Measurements', done: !!m, sub: m ? MEASURES.filter((k) => m[k] != null).map((k) => `${k} ${m[k]}`).join(' · ') : 'waist, chest, arms, thighs, hips, neck + photos' });
  }
  chainItem(CHAINS[0]);
  customChainDefs().forEach(chainItem);
  if (d < chainStart()) {
    items.push({ k: 'plan', label: 'Plan the first week', done: !!S.weekPlans[weekStart(chainStart())], sub: `programme starts ${fmtDate(chainStart())}` });
    return items;
  }
  const sl = sleepOn(d);
  items.push({ k: 'sleep', label: `Slept ${st.sleepGoal} h+`, auto: true, done: !!sl && sl.hours >= st.sleepGoal, sub: sl ? `${sl.hours} h logged${sl.notes === 'From Garmin' ? ' from Garmin' : ''}` : 'tap to log last night' });
  const meal = (k, ref, label) => { const m = mealsOn(d).find((x) => x.ref === ref); items.push({ k, label, done: !!m, sub: m ? `logged ${fmtTime(m.at)}` : `tap to log · window ${win().from}–${win().to}` }); };
  if (kind !== 'fast') {
    meal('meal1', 'gironda1', 'Meal 1 · 3 patties + 6 eggs');
    meal('meal2', 'gironda2', 'Meal 2 · steak + 6 eggs');
    if (isRefeed(d)) items.push({ k: 'macros', label: 'Carb-up: protein hit, carbs up', auto: true, done: mac.p >= st.proteinGoal && mac.c >= REFEED_CARBS,
      sub: `P ${Math.round(mac.p)}/${st.proteinGoal} g · C ${Math.round(mac.c)}/${REFEED_CARBS}+ g · no calorie cap today` });
    else items.push({ k: 'macros', label: 'Hit macros', auto: true, done: mac.p >= st.proteinGoal && mac.kcal > 0 && mac.kcal <= st.kcalGoal,
      sub: `P ${Math.round(mac.p)}/${st.proteinGoal} g · ${Math.round(mac.kcal)}/${st.kcalGoal} kcal` });
  } else items.push({ k: 'fastday', label: 'Fast day: nothing eaten', auto: true, done: !mealsOn(d).length, sub: 'Water, tea and electrolytes only' });
  {
    const cs = chainStatus(d, 'cut'), st2 = chainStreak('cut');
    const got = CUT_REFS.map((r, i) => `Meal ${i + 1} ${mealsOn(d).some((m) => m.ref === r) ? '✓' : '—'}`).join(' · ');
    items.push({ k: 'cut', label: 'Cut day: Gironda meals only', auto: true, done: cs === 'done',
      sub: cs === 'miss' ? 'something else logged today: start again tomorrow' : `${cs === 'done' ? `Day ${st2.cur}` : got} · nothing else` });
  }
  const trained = workoutsOn(d).length > 0;
  if (kind === 'rest' || kind === 'fast') items.push({ k: 'rest', label: 'Rest day respected', auto: true, done: !trained, sub: 'Recovery is when you grow' });
  else items.push({ k: 'workout', label: 'Worked out', done: trained, sub: trained ? workoutsOn(d).map((w) => w.dayName).join(', ') : 'tap to mark done, or log sets in Train' });
  items.push({ k: 'steps', label: `${st.stepGoal.toLocaleString('en-GB')} steps`, done: stepsOn(d) >= st.stepGoal, sub: stepsOn(d) ? `${stepsOn(d).toLocaleString('en-GB')} so far` : 'tap to enter from Garmin' });
  goalsFor(d).forEach((g) => items.push({ k: `goal:${g.id}:${g.recurring ? 1 : 0}`, label: g.text, done: g.done, sub: catName(g.cat) }));
  items.push({ k: 'plan', label: 'Plan tomorrow', done: chainStatus(d, 'plan') === 'done', sub: 'after your last meal' });
  items.push({ k: 'journal', label: 'Gratitude journal', done: !!S.journal[d], sub: 'three good things' });
  return items;
}

const measureDay = (d) => d === chainStart() || parseDate(d).getDay() === 1;

function openWeighIn() {
  const last = latestWeight();
  openSheet('Weigh in', `<form id="weight-form" class="grid1" autocomplete="off">
    <label class="field">Weight (kg)<input name="kg" inputmode="decimal" required placeholder="${last ? last.kg : '90.0'}"></label>
    <input type="hidden" name="date" value="${today()}">
    <button class="primary" type="submit">Save · +${PTS.weigh} XP</button>
    <p class="muted small">Same time every morning: after the toilet, before food or drink. Day-to-day swings of a kilo are water and salt; the 7-day average is the number that matters.</p>
  </form>`);
}

function openMeasureSheet() {
  const last = [...S.measurements].sort((a, b) => b.date.localeCompare(a.date))[0];
  openSheet('Measurements', `<form id="meas-form" class="grid2" autocomplete="off">
    ${MEASURES.map((m) => `<label class="field">${m[0].toUpperCase() + m.slice(1)} (cm)<input name="${m}" inputmode="decimal" placeholder="${last?.[m] ?? ''}"></label>`).join('')}
    <input type="hidden" name="date" value="${today()}">
    <button class="primary" style="grid-column:1/-1" type="submit">Save · +${PTS.measure} XP</button>
    <p class="muted small" style="grid-column:1/-1">Tape level and snug, not tight. Waist at the navel, neck just below the Adam's apple, arms and thighs at the widest point. Then front, side and back photos: same spot, same light.${S.settings.heightCm ? '' : ' Add your height in Body → Setup for a body-fat estimate.'}</p>
  </form>`);
}

function checklistCard(d) {
  const items = checklistFor(d);
  const done = items.filter((x) => x.done).length;
  const all = done === items.length;
  return `<section class="card checklist ${all ? 'perfect' : ''}">
    <div class="row between"><h2>Daily checklist</h2><b class="cl-count">${done}/${items.length}</b></div>
    ${bar(done, items.length, all ? 'good' : 'xp')}
    ${all ? `<p class="small good-text"><b>Perfect day.</b> Every box ticked · +${PTS.perfect} XP</p>` : ''}
    <div class="cl-list">${items.map((x) => `<button class="cl-item ${x.done ? 'on' : ''}" role="checkbox" aria-checked="${x.done}" data-act="tick" data-k="${esc(x.k)}">
      <span class="cl-box" aria-hidden="true">${x.done ? '✓' : ''}</span>
      <span class="grow"><span class="cl-label">${esc(x.label)}</span>${x.sub ? `<br><span class="muted small">${esc(x.sub)}${x.auto && !x.done ? ' · ticks itself' : ''}</span>` : ''}</span></button>`).join('')}</div>
  </section>`;
}

// A small burst from the ticked box: the reward should be instant.
function celebrateTick(k, perfect) {
  navigator.vibrate?.(perfect ? [30, 60, 30, 60, 80] : 18);
  const el = [...document.querySelectorAll('[data-act=tick]')].find((b) => b.dataset.k === k);
  if (!el) return;
  el.classList.add('pop');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = el.querySelector('.cl-box').getBoundingClientRect();
  const burst = document.createElement('div');
  burst.className = 'burst';
  burst.style.left = `${box.left + box.width / 2}px`;
  burst.style.top = `${box.top + box.height / 2}px`;
  const n = perfect ? 28 : 10;
  for (let i = 0; i < n; i++) {
    const sp = document.createElement('i');
    const a = (Math.PI * 2 * i) / n, r = (perfect ? 90 : 40) + Math.random() * 24;
    sp.style.setProperty('--x', `${Math.cos(a) * r}px`);
    sp.style.setProperty('--y', `${Math.sin(a) * r}px`);
    sp.style.background = ['var(--good)', 'var(--xp)', 'var(--warn)', 'var(--accent)'][i % 4];
    burst.appendChild(sp);
  }
  document.body.appendChild(burst);
  setTimeout(() => burst.remove(), 800);
}

function onTick(k) {
  const d = today();
  const item = checklistFor(d).find((x) => x.k === k);
  if (!item) return false;
  const [kind, id, rec] = k.split(':');
  switch (kind) {
    case 'chain': { const c = (dayRec(d).chains ||= {}); if (c[id] === true) delete c[id]; else c[id] = true; break; }
    case 'meal1': case 'meal2': {
      const ref = kind === 'meal1' ? 'gironda1' : 'gironda2';
      const m = mealsOn(d).find((x) => x.ref === ref);
      if (m) S.meals = S.meals.filter((x) => x.id !== m.id);
      else addMealFromFood({ ...STAPLES.find((x) => x.id === ref), kind: 'staple' }, 1, d, kind === 'meal1' ? 'Breakfast' : 'Lunch');
      break;
    }
    case 'workout': {
      const ws = workoutsOn(d);
      if (!ws.length) {
        const prog = activeProgram(), day = nextDay(prog);
        S.workouts.push({ id: uid(), date: d, at: new Date().toISOString(), programId: prog.id, programName: prog.name, family: prog.family, dayId: day.id, dayName: day.name, entries: [], quick: true });
      } else if (ws.every((w) => w.quick)) S.workouts = S.workouts.filter((w) => !(w.date === d && w.quick));
      else { ui.tab = 'train'; return 'nav'; }
      break;
    }
    case 'steps': openSteps(d); return 'sheet';
    case 'weigh': openWeighIn(); return 'sheet';
    case 'measure': openMeasureSheet(); return 'sheet';
    case 'sleep': if (item.done) return 'none'; ui.tab = 'body'; ui.sub.body = 'sleep'; return 'nav';
    case 'goal': {
      if (rec === '1') { const t = (dayRec(d).dg ||= {}); if (t[id]) delete t[id]; else t[id] = true; }
      else { const g = (S.dayGoals[d] || []).find((x) => x.id === id); if (g) g.done = !g.done; }
      break;
    }
    case 'plan':
      if (d < chainStart()) { ui.tab = 'plan'; ui.sub.plan = 'week'; ui.weekStart = weekStart(chainStart()); return 'nav'; }
      ui.tab = 'plan'; ui.sub.plan = 'tomorrow'; ui.planDate = addDays(d, 1); return 'nav';
    case 'journal': ui.tab = 'hero'; ui.sub.hero = 'journal'; return 'nav';
    default: // macros, rest, fast day tick themselves
      if (!item.done) toast(k === 'cut' ? 'Ticks itself once Meal 1 and Meal 2 are logged and nothing else' : k === 'macros' ? `Ticks itself at ${S.settings.proteinGoal} g protein and ≤ ${S.settings.kcalGoal} kcal` : 'This one ticks itself');
      return 'none';
  }
  return 'ticked';
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
  ${redFlagCard(d)}
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
  ${location.pathname.startsWith('/Training/shredded-trainer') ? `<section class="card slim"><p class="small"><b>This app is now Iron &amp; Eggs</b> at <a href="https://eddie144-ai.github.io/">eddie144-ai.github.io</a>. Same data. Open it there and add that one to your home screen.</p></section>` : ''}
  ${backupDue() && S.workouts.length + S.meals.length + S.weights.length ? `<section class="card slim"><p class="small">💾 No backup for a week. <button class="linkish inline" data-act="go-apps">Back up everything</button></p></section>` : ''}
  ${fastingCard()}
  <section class="card">
    <h2>Diet &amp; health <span class="right">auto-kept</span></h2>
    ${started ? healthChains().map(chainRow).join('') : `<p>Diet, fasting, training, steps and sleep chains start <b>${fmtDate(chainStart())}</b> (${daysBetween(d, chainStart())} day${daysBetween(d, chainStart()) === 1 ? '' : 's'} to go).</p>
      <p class="muted small">Use the days before to plan the first week and do a shop.</p>`}
  </section>
  ${d >= cleanStart() ? checklistCard(d) : ''}
  ${quickLogCard(d)}
  ${mentzerCard()}
  ${d >= cleanStart() ? `<section class="card">
    <h2>Clean chains <span class="right">miss a day and it resets</span></h2>
    ${otherChains().filter((c) => started || isClean(c)).map(chainRow).join('')}
  </section>` : ''}
  ${refeedCard(d)}
  ${cutCheckinCard(d)}
  ${d >= cleanStart() ? coffeeSupport() : ''}
  ${lifeCard(d)}
  ${new Date().getHours() < 11 && !S.dreams[d] ? `<section class="card slim"><p class="small">🌙 Remember a dream? <button class="linkish inline" data-act="go-dream">Log it before it fades</button></p></section>` : ''}
  ${todayGoalsCard(d)}
  ${todaysPlanCard(d)}
  ${planTomorrowPrompt(d)}
  <section class="card">
    <h2>Fluids <span class="right">${(fl / 1000).toFixed(2)} / ${(fg / 1000).toFixed(2)} L</span></h2>
    ${bar(fl, fg, fl >= fg ? 'good' : '')}
    <div class="grid4">${[250, 500, 750, 1000].map((ml) => `<button data-act="fluid-add" data-ml="${ml}">+${ml}</button>`).join('')}</div>
    <button class="linkish inline small" data-act="go-drinks">What can I drink?</button>
    ${S.days[d]?.sweat ? `<p class="muted small">Sweat-suit day: target raised by ${S.settings.walkExtraMl} ml to replace sweat losses.</p>` : ''}
  </section>
  <section class="card">
    <h2>Stoic of the day</h2>
    <p class="quote">“${esc(q[0])}”</p>
    <p class="muted">— ${esc(q[1])}</p>
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
    <p class="muted small">${kind === 'train' ? `Next session: <b>${esc(prog.name)} · ${esc(nextDay(prog).name)}</b>. Train in or just before your window (${esc(win().from)}–${esc(win().to)}).` : kind === 'fast' ? 'Fast day: no meals, water and electrolytes, steps only. Counts for the diet chain if nothing is logged.' : kind === 'rest' ? 'Rest day: recovery is when you grow. Training today would break the plan.' : 'Pick training, rest or fast.'}</p>
    <button class="check" role="checkbox" aria-checked="${!!p.sweat}" data-act="plan-sweat" data-date="${d}"><span class="box" aria-hidden="true">${p.sweat ? '✓' : ''}</span><span>Sweat-suit walk (bonus +${PTS.sweat} XP)</span></button>
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
    <h2>Top 3 for ${d === addDays(t, 1) ? 'tomorrow' : fmtDate(d)} <span class="right">SMARTENUP</span></h2>
    ${smartGuide()}
    ${[0, 1, 2].map((i) => topGoalEditor(d, p, i)).join('')}
    ${p.top?.[0] ? `<div class="woop">
      <p class="rlabel">If–then plan for #1</p>
      <label class="field">What's most likely to get in the way?<input value="${esc(p.woop?.obstacle || '')}" maxlength="100" placeholder="e.g. I'm tired after work" data-planwoop="${d}|obstacle"></label>
      <label class="field">If that happens, then I will…<input value="${esc(p.woop?.plan || '')}" maxlength="100" placeholder="e.g. do just the first 10 minutes" data-planwoop="${d}|plan"></label>
      <p class="muted small">Picture finishing #1, then the obstacle, then your plan. Planning for the obstacle ahead of time (WOOP) makes follow-through far more likely than motivation alone.</p>
    </div>` : ''}
  </section>
  <button class="primary" data-act="plan-save" data-date="${d}">${p.madeAt ? 'Update plan' : `Lock in the plan · +${QUEST_BASE} XP`}</button>`;
}

function smartGuide() {
  return `<details class="smart-guide"><summary>How to write a goal that gets done</summary>
    <div class="list small">${SMARTENUP.map(([k, n, h]) => `<div><b>${k} · ${n}</b><br><span class="muted">${esc(h)}</span></div>`).join('')}
    <div><b>Process over outcome</b><br><span class="muted">77 kg is the outcome. Your top 3 should be actions you control today: steps, meals, the session, filming.</span></div>
    <div><b>Never miss twice</b><br><span class="muted">If a day goes wrong, make tomorrow's #1 the smallest version of the habit. One miss is an accident; two is a new habit.</span></div></div></details>`;
}

function topGoalEditor(d, p, i) {
  const self = p.topCheck?.[i] || {};
  const r = smartCheck({ text: p.top?.[i] || '', when: p.topWhen?.[i] || '', why: p.topWhy?.[i] || '', self });
  const tap = `data-date="${d}" data-i="${i}"`;
  return `<div class="topgoal" data-smart data-smart-tap='${tap}'>
    <input value="${esc(p.top?.[i] || '')}" placeholder="${['#1 · the one thing that matters most', '#2', '#3'][i]}" maxlength="100" aria-label="Priority ${i + 1}" data-plantop="${d}|${i}|text" data-sm="text">
    <div class="grid2"><input value="${esc(p.topWhen?.[i] || '')}" placeholder="When? 10:00" maxlength="40" aria-label="When for priority ${i + 1}" data-plantop="${d}|${i}|when" data-sm="when">
    <input value="${esc(p.topWhy?.[i] || '')}" placeholder="Why it matters" maxlength="100" aria-label="Why for priority ${i + 1}" data-plantop="${d}|${i}|why" data-sm="why"></div>
    <div class="smart-wrap">${smartStrip(r, (k) => `data-act="smart-self" ${tap} data-l="${k}"`)}</div>
  </div>`;
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
  <section class="card"><h2>Weekly goals <span class="right">${weeklyFor(ws).length}</span></h2>
    ${weeklyFor(ws).map((g) => `<p class="small">• ${esc(g.text)} · ${g.target}×</p>`).join('') || '<p class="muted small">None set for this week.</p>'}
    <button class="small-btn" data-act="go-goals" data-v="week" data-ws="${ws}">Set weekly goals →</button></section>
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

// The weight to beat, in a circle like the Day badges.
function prevBadge(last) {
  if (!last) return '<span class="prevbadge none" aria-label="No previous weight"><small>Last</small>—</span>';
  const sets = last.entry.sets.filter((x) => x.kg != null || x.reps != null || x.hold != null);
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
  const input = (s, field, ph, label, mode2 = 'numeric') => `<input inputmode="${mode2}" placeholder="${ph}" value="${esc(draft.sets?.[s]?.[field] ?? '')}" aria-label="${esc(e.name)} ${label}" data-draft="${ref}|${s}|${field}">`;
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
    ${last ? `<p class="muted small">${last.baseline ? 'Starting point' : 'Last'} (${fmtDate(last.date)}): ${last.entry.sets.filter((s) => s.kg != null || s.reps != null || s.hold != null).map(setText).join(', ')}${last.entry.note ? ` · ${esc(last.entry.note)}` : ''}</p>` : ''}
    ${hint ? `<p class="small good-text">▲ ${esc(hint)}</p>` : ''}
    ${mode === 'hold' ? `<p class="muted small">Target: ${esc(e.reps)}. Hold at full contraction, then lower slowly.</p>` : ''}
    ${rows}
    <div class="row wrap">
      ${mode === 'singles' ? '<button class="small-btn" data-act="rp-timer">10 s rest</button>' : ''}
      ${mode === 'singles' ? '' : `<button class="small-btn" data-act="set-add" ${base}>+ Add set</button>`}
      ${extra ? `<button class="small-btn" data-act="set-del" ${base}>− Remove extra set</button>` : ''}
      ${last ? `<button class="small-btn" data-act="copy-last" data-pid="${esc(prog.id)}" data-did="${esc(day.id)}" data-eid="${esc(e.id)}">Fill from last time</button>` : ''}
      <input class="grow" placeholder="Note (forced reps, negatives, feel…)" value="${esc(draft.note || '')}" aria-label="${esc(e.name)} note" data-draft="${ref}|note">
    </div>
  </div>`;
}

const FEELS = [[1, 'Rough'], [2, 'Hard'], [3, 'OK'], [4, 'Good'], [5, 'Great']];
const feelName = (n) => FEELS.find(([k]) => k === n)?.[1] || '';
// How the whole session felt, saved with it: a 1–5 rating and a note.
function sessionFeelCard(prog, day) {
  const dr = getDraft(prog.id, day.id)._session || {};
  return `<div class="excard feel">
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
      <button class="small-btn" data-act="ex-move" data-dir="-1" ${base} ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑ Up</button>
      <button class="small-btn" data-act="ex-move" data-dir="1" ${base} ${i === day.exercises.length - 1 ? 'disabled' : ''} aria-label="Move down">↓ Down</button>
      <button class="small-btn danger" data-act="ex-del" ${base}>Remove</button>
    </div>
  </div>`;
}

// Everything you lifted before the app, for reference: the circles above use the same numbers.
function referenceLifts() {
  const list = Object.values(S.baselines || {}).sort((a, b) => a.name.localeCompare(b.name));
  if (!list.length) return '';
  return `<section class="card"><details><summary><b>Previous lifts</b> <span class="muted small">· ${list.length} exercises for reference</span></summary>
    <div class="list small">${list.map((b) => `<div><b>${esc(b.name)}</b> <span class="muted">· ${fmtDate(b.date)}</span><br>${b.sets.filter((x) => x.kg != null || x.reps != null).map(setText).join(', ')}${b.note ? `<br><span class="muted">${esc(b.note)}</span>` : ''}</div>`).join('')}</div>
  </details></section>`;
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
  ${mentzerCard()}
  ${segmented('family', [['cycle', '4-Week Cycle'], ['hit', 'Mentzer HIT']], fam, 'Training style')}
  ${fam === 'hit' ? `${segmented('tier', TIERS.map(([k, l]) => [k, l]), S.settings.tier, 'Mentzer level')}<p class="muted small tierdesc">${esc(tier[2])}</p>` : ''}
  <div class="chiprow">${programs(fam, fam === 'hit' ? S.settings.tier : null).map((p) => `<button class="pchip" data-act="pick-program" data-v="${esc(p.id)}" aria-pressed="${p.id === prog.id}">${esc(p.name)}</button>`).join('')}</div>
  ${done.length ? `<section class="card slim"><p>${chip('✓ Trained today', 'good')} <span class="muted small">${done.map((w) => esc(w.dayName)).join(', ')}</span></p></section>` : ''}
  ${!done.length && (kind === 'rest' || kind === 'fast') ? `<section class="card slim"><p>${chip(kind === 'fast' ? 'Fast day (planned)' : 'Rest day (planned)', 'warn')} <span class="muted small">Training today breaks the plan chain.</span></p></section>` : ''}
  ${af && fastHours(af) >= 24 ? `<section class="card slim"><p class="small warn-text">⚠ You are ${Math.floor(fastHours(af))} hours into a fast. HIT needs fuel: train after you break it, in your eating window.</p></section>` : ''}
  <section class="card">
    <div class="row between wrap"><h3>${esc(prog.name)}</h3>${rec ? chip(rec.text, rec.cls) : chip(`Cycle week ${Math.max(1, cycleWeek())}`)}</div>
    ${garminReadiness() ? `<p>${chip(garminReadiness().text, garminReadiness().cls)}</p>` : ''}
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
      ${sessionFeelCard(prog, day)}
      <button class="primary" data-act="complete" data-pid="${esc(prog.id)}" data-did="${esc(day.id)}">Complete session · +${PTS.session} XP</button>
    `}
  </section>
  <section class="card">
    <h2>History · ${esc(prog.name)}</h2>
    ${hist.length ? `<div class="list">${hist.map((w) => `<div>
      <div class="row between"><button class="linkish grow" data-act="open-session" data-id="${esc(w.id)}"><b>${esc(w.dayName)}</b><br><span class="muted small">${fmtDate(w.date)} ${fmtTime(w.at)}${w.quick ? ' · quick' : ''}</span></button>
      <button class="icon ghost" data-act="del-workout" data-id="${esc(w.id)}" aria-label="Delete session">✕</button></div>
      ${w.feel || w.note ? `<p class="small">${w.feel ? chip(`Felt: ${feelName(w.feel)}`, w.feel >= 4 ? 'good' : w.feel <= 2 ? 'warn' : '') : ''} ${w.note ? `<span class="muted">${esc(w.note)}</span>` : ''}</p>` : ''}
      ${ui.openSession === w.id ? `<div class="small muted">${(w.entries || []).map((e) => `${esc(e.name)}: ${e.sets.map(setText).join(', ')}${e.note ? ` (${esc(e.note)})` : ''}`).join('<br>') || 'No sets logged.'}</div>` : ''}
    </div>`).join('')}</div>` : `<p class="muted">No sessions logged for this program yet.${Object.keys(S.baselines).length ? ' Your last weights from before the reset show as starting points.' : ''}</p>`}
  </section>
  ${referenceLifts()}
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
  <button data-act="scan-food">Scan a barcode</button>
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

function drinksCard(open = true) {
  const group = (title, cls, xs) => `<p class="rlabel ${cls}">${title}</p><div class="list small">${xs.map(([n, why]) => `<div><b>${esc(n)}</b><br><span class="muted">${esc(why)}</span></div>`).join('')}</div>`;
  return `<section class="card"><details class="drinks" ${open ? 'open' : ''}><summary><h2>What to drink on the cut</h2></summary>
    ${group('✓ Any time, fasting or not', 'good-text', CUT_DRINKS.yes)}
    ${group('~ Inside the eating window only', 'warn-text', CUT_DRINKS.window)}
    ${group('✗ Not on the cut', 'danger', CUT_DRINKS.no)}
  </details></section>`;
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
    <p class="muted small">Target ${S.settings.fluidMl} ml, plus ${S.settings.walkExtraMl} ml on sweat-suit days. Add electrolytes after sweat-suit walks and on long fasts.</p>
  </section>
  ${drinksCard()}
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
  </section>
  ${decisionCard()}
  ${timelineCard()}`;
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
  </section>
  ${photosCard()}`;
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

// ===========================================================================
// GARMIN
// ===========================================================================
// Everything the Venu Sq records, entered from Garmin Connect's daily summary.
// better: which direction is an improvement (for the trend arrows).
const GARMIN_FIELDS = [
  ['steps', 'Steps', '', 'up', 'Syncs with your steps chain'],
  ['rhr', 'Resting heart rate', 'bpm', 'down', 'Heart icon → resting value'],
  ['bbWake', 'Body Battery on waking', '', 'up', 'Figure with lightning circle'],
  ['bbHigh', 'Body Battery high', '', 'up', ''],
  ['bbLow', 'Body Battery low', '', 'up', ''],
  ['stress', 'Average stress', '0–100', 'down', 'Person with lightning bolt'],
  ['resp', 'Average respiration', 'brpm', null, 'Wind icon, breaths per minute'],
  ['spo2', 'Pulse Ox average', '%', 'up', 'Overnight average if tracked'],
  ['sleepH', 'Sleep', 'h', 'up', 'Also fills your sleep log'],
  ['sleepScore', 'Sleep score', '0–100', 'up', 'If Garmin Connect shows one'],
  ['intensity', 'Intensity minutes', 'min', 'up', 'Today; the weekly total is the sum'],
  ['activeKcal', 'Active calories', 'kcal', null, ''],
  ['distance', 'Distance', 'km', 'up', ''],
  ['maxHr', 'Max heart rate', 'bpm', null, ''],
];
const gOn = (date) => S.garmin[date] || null;
const gVal = (date, k) => (k === 'steps' ? (stepsOn(date) || null) : gOn(date)?.[k] ?? null);
function gAvg(k, end, days) {
  const xs = [];
  for (let i = 0; i < days; i++) { const v = gVal(addDays(end, -i), k); if (v != null) xs.push(v); }
  return xs.length ? sum(xs, (x) => x) / xs.length : null;
}

// A recovery read for training, from waking Body Battery and resting heart rate against your own 7-day baseline.
function garminReadiness(date = today()) {
  const g = gOn(date);
  if (!g) return null;
  const bb = g.bbWake ?? g.bbHigh;
  const base = gAvg('rhr', addDays(date, -1), 7);
  const rhrUp = g.rhr != null && base != null ? g.rhr - base : null;
  if ((bb != null && bb < 30) || (rhrUp != null && rhrUp >= 7)) return { cls: 'bad', text: `Garmin: low recovery${bb != null ? ` · BB ${bb}` : ''}${rhrUp != null && rhrUp >= 7 ? ` · RHR +${Math.round(rhrUp)}` : ''}` };
  if ((bb != null && bb < 50) || (rhrUp != null && rhrUp >= 4)) return { cls: 'warn', text: `Garmin: so-so recovery${bb != null ? ` · BB ${bb}` : ''}` };
  if (bb != null || rhrUp != null) return { cls: 'good', text: `Garmin: recovered${bb != null ? ` · BB ${bb}` : ''}` };
  return null;
}

function spark(k, end) {
  const pts = Array.from({ length: 14 }, (_, i) => gVal(addDays(end, i - 13), k));
  const xs = pts.filter((v) => v != null);
  if (xs.length < 2) return '';
  const lo = Math.min(...xs), hi = Math.max(...xs), span = hi - lo || 1;
  const coords = pts.map((v, i) => (v == null ? null : `${(i * 140) / 13},${34 - ((v - lo) / span) * 30}`)).filter(Boolean).join(' ');
  return `<svg class="spark" viewBox="0 0 140 36" preserveAspectRatio="none" aria-hidden="true"><polyline points="${coords}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

function garminInsights(d) {
  const out = [];
  const r = garminReadiness(d);
  if (r?.cls === 'bad') out.push('Recovery looks low today. On a HIT day, consider moving the session a day: Mentzer\'s rule is to recover first.');
  const st = gAvg('stress', d, 7), stPrev = gAvg('stress', addDays(d, -7), 7);
  if (st != null && stPrev != null && st - stPrev >= 8) out.push(`Average stress is up ${Math.round(st - stPrev)} on last week. Check sleep, caffeine slips and fasting length.`);
  const sl = gAvg('sleepH', d, 7);
  if (sl != null && sl < 7) out.push(`Sleep is averaging ${round1(sl)} h: below 7 h, fat loss and strength both suffer.`);
  const rhr = gAvg('rhr', d, 7), rhrPrev = gAvg('rhr', addDays(d, -28), 7);
  if (rhr != null && rhrPrev != null && rhrPrev - rhr >= 2) out.push(`Resting heart rate is down ${Math.round(rhrPrev - rhr)} bpm on a month ago: fitness is moving the right way.`);
  const sp = gOn(d)?.spo2;
  if (sp != null && sp < 92) out.push('Pulse Ox under 92% is worth a re-check. Wrist readings can be off; if it stays low, mention it to your GP.');
  return out;
}

function viewBodyGarmin() {
  const t = today();
  const d = ui.garminDate || t;
  const g = gOn(d) || {};
  const hist = Object.keys(S.garmin).sort().reverse().slice(0, 14);
  const tips = garminInsights(t);
  const shown = GARMIN_FIELDS.filter(([k]) => gAvg(k, t, 7) != null);
  return `
  ${readinessCard(t)}
  ${shown.length ? `<section class="card"><h2>Last 7 days <span class="right">vs the 7 before</span></h2>
    <div class="gtiles">${shown.map(([k, label, unit, better]) => {
      const a = gAvg(k, t, 7), b = gAvg(k, addDays(t, -7), 7);
      const diff = a != null && b != null ? a - b : null;
      const good = diff == null || !better || Math.abs(diff) < 0.5 ? '' : (diff > 0) === (better === 'up') ? 'good-text' : 'warn-text';
      const fmt = (v) => (k === 'steps' || k === 'activeKcal' ? Math.round(v).toLocaleString('en-GB') : fmtNum(round1(v)));
      return `<div class="gtile"><span class="muted small">${esc(label)}</span><b>${fmt(a)}<small> ${esc(unit === '0–100' ? '' : unit)}</small></b>
        ${diff != null && Math.abs(diff) >= 0.5 ? `<span class="small ${good}">${diff > 0 ? '▲' : '▼'} ${fmt(Math.abs(diff))}</span>` : '<span class="small muted">—</span>'}${spark(k, t)}</div>`;
    }).join('')}</div></section>` : ''}
  ${tips.length ? `<section class="card"><h2>What it says</h2><ul class="small tips">${tips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p class="muted small">Trends against your own baseline, not medical advice.</p></section>` : ''}
  <section class="card">
    <h2>Enter a day ${gOn(d) ? '<span class="right">saved · edit</span>' : ''}</h2>
    ${dateNav('garmin-date', d, { max: t })}
    <form id="garmin-form" class="grid2" data-date="${d}" autocomplete="off">
      ${GARMIN_FIELDS.map(([k, label, unit, , hint]) => `<label class="field">${esc(label)}${unit ? ` <span class="muted small">(${esc(unit)})</span>` : ''}
        <input name="${k}" inputmode="decimal" value="${gVal(d, k) ?? ''}" ${hint ? `placeholder="${esc(hint)}"` : ''}></label>`).join('')}
      <button class="primary" style="grid-column:1/-1" type="submit">Save Garmin day · +${PTS.garmin} XP</button>
    </form>
    <p class="muted small">Fill what you have, from the watch or Garmin Connect → My Day. Leave the rest blank. Best done each morning for the day before, once last night's sleep has synced.</p>
    <details class="small"><summary>Which watch icon is which?</summary><ul>
      <li>❤ Heart: heart rate (use the <b>resting</b> figure from the heart-rate widget)</li>
      <li>Person with lightning bolt: <b>stress</b> (0–25 rest, 26–50 low, 51–75 medium, 76+ high)</li>
      <li>Figure with lightning circle: <b>Body Battery</b> (0–100 energy reserve)</li>
      <li>Wind: <b>respiration</b>, breaths per minute</li>
    </ul></details>
  </section>
  ${hist.length ? `<section class="card"><h2>History</h2><div class="list">${hist.map((x) => { const r = S.garmin[x]; return `<div class="row between">
    <button class="linkish grow" data-act="garmin-edit" data-date="${x}"><b>${fmtDate(x)}</b><br><span class="muted small">${GARMIN_FIELDS.filter(([k]) => gVal(x, k) != null).slice(0, 5).map(([k, l]) => `${l.replace('Body Battery', 'BB').replace('Average ', '').replace('Resting heart rate', 'RHR')} ${k === 'steps' ? gVal(x, k).toLocaleString('en-GB') : gVal(x, k)}`).join(' · ')}</span></button>
    <button class="icon ghost" data-act="garmin-del" data-date="${x}" aria-label="Delete Garmin day">✕</button></div>`; }).join('')}</div></section>` : ''}`;
}

function readinessCard(d) {
  const r = garminReadiness(d);
  if (!r) return `<section class="card slim"><p class="small">No Garmin data for today yet. Enter this morning's resting heart rate and Body Battery below for a recovery read.</p></section>`;
  return `<section class="card slim"><p>${chip(r.text, r.cls)}</p></section>`;
}

const DOCS = 'https://github.com/eddie144-ai/Training/blob/main/shredded-system/docs';
function viewBodyGuide() {
  const st = S.settings;
  const rule = (h, p) => `<div><b class="small">${h}</b><p class="muted small">${p}</p></div>`;
  return `
  <section class="card">
    <h2>The plan</h2>
    <p class="small"><b>My 4-Week Program</b> (4-day split) with the <b>Gironda diet</b>: meat and eggs at every meal, carbs low on most days, and a planned carb-up every ${st.carbupHours} hours. Lose 0.5–1% of bodyweight a week toward ${st.target} kg, then decide about ${st.goalLow} kg.</p>
    <div class="grid2"><a class="btn" href="${DOCS}/full-guide.pdf" target="_blank" rel="noopener">Full guide (PDF)</a><a class="btn" href="${DOCS}/research-report.pdf" target="_blank" rel="noopener">Research report (PDF)</a></div>
  </section>
  <section class="card">
    <h2>Daily rhythm</h2>
    <div class="rhythm">${rhythm().map(([t, l]) => `<b>${esc(t)}</b><span>${esc(l)}</span>`).join('')}</div>
  </section>
  <section class="card">
    <h2>Training on a cut</h2>
    <div class="list">
      ${rule('Weeks 1–2: strength base, 6–8 reps', 'Keep the weights from your best sessions. Stop compounds 1 rep short of failure; isolation work can go to failure. Holding your numbers in a deficit is a win.')}
      ${rule('Weeks 3–4: hypertrophy, 10–12 reps', 'Higher volume costs more recovery. If two sessions in a row drop, bring the carb-up forward or drop the last set of each exercise.')}
      ${rule('Put carb-ups on the hard days', 'Day 2 (legs) and Day 4 (back and deadlifts) benefit most. Carb up the day before or on the day.')}
      ${rule('Recovery', `Four sessions a week plus steps is a lot in a deficit. Sleep ${st.sleepGoal} h+, keep protein at ${st.proteinGoal} g, and treat a stalled lift as a recovery signal, not a reason to add volume.`)}
      ${rule('After week 4', 'From the Monday after week 4, Today offers Mike Mentzer HIT for the next month: one all-out set per exercise and more rest, which suits a deep cut. Or run the cycle again with heavier starting weights.')}
    </div>
  </section>
  <section class="card">
    <h2>Eating</h2>
    <div class="list">
      ${rule('Gironda meals', 'Meal 1: 6 eggs + 3 patties. Meal 2: 6 eggs + steak. Quick-add both in Fuel. The cut-day chain counts only these (a fast day or carb-up day also counts).')}
      ${rule('Fix the gaps', 'Add 2 handfuls of greens to each meal and 5–10 g psyllium for fibre. Leaner beef (5%) instead of pork patties brings saturated fat down. Never raw eggs.')}
      ${rule('Carb-up day', 'About maintenance calories, protein the same, fat 40–50 g, carbs 200–300 g from rice, potatoes, oats and fruit. Planned to the gram, not a cheat day. Weight jumps 0.5–1.5 kg the next morning: water and glycogen.')}
      ${rule('Targets', `${st.kcalGoal} kcal, ${st.proteinGoal} g protein (Body → Setup). The weekly decision (Body → Weight) tells you when to change calories, one step at a time.`)}
    </div>
  </section>
  <section class="card">
    <h2>Safety</h2>
    <div class="list">
      ${rule('Never', `Dehydration or water and salt manipulation, diuretics or laxatives, raw eggs or raw milk, fewer than ${KCAL_FLOOR} kcal a day without a clinician, fasts over 24 hours on appetite-suppressing medication.`)}
      ${rule('Medication', 'Retatrutide is investigational and not approved in the UK or US. This app records what you take and how you feel; it never advises on doses. Please review it with a GP.')}
      ${rule('Red flags', RED_FLAGS.map(([a, b]) => `${a}: ${b}`).join(' '))}
    </div>
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
      ${f('walkExtraMl', 'Extra on sweat-suit days (ml)', st.walkExtraMl)}
      ${f('stepGoal', 'Daily steps', st.stepGoal)}
      ${f('stepDays', 'Step days a week', st.stepDays)}
      ${f('stepWeek', 'Or weekly steps total', st.stepWeek)}
      ${f('sleepGoal', 'Sleep chain (hours)', st.sleepGoal, 'decimal')}
      <label class="field">Carb-up every<select name="carbupHours">${[[72, '72 h (Gironda)'], [96, '96 h'], [120, '120 h']].map(([v, l]) => `<option value="${v}" ${Number(st.carbupHours) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${f('startWeight', 'Start weight (kg)', st.startWeight, 'decimal')}
      ${f('target', 'Target weight (kg)', st.target, 'decimal')}
      ${f('goalLow', 'Lowest goal (kg)', st.goalLow, 'decimal')}
      ${f('heightCm', 'Height (cm)', st.heightCm, 'decimal')}
      <label class="field">4-week cycle start<input name="cycleStart" type="date" value="${esc(st.cycleStart)}"></label>
      <label class="field">Programme start<input name="chainStart" type="date" value="${esc(st.chainStart)}"></label>
      <label class="field">No-coffee start<input name="coffeeStart" type="date" value="${esc(st.coffeeStart || st.chainStart)}"></label>
      <button class="primary" style="grid-column:1/-1" type="submit">Save targets</button>
    </form>
    <p class="muted small">The diet chain needs every meal inside the window and calories at or under target.</p>
  </section>
  <section class="card">
    <h2>Look</h2>
    ${segmented('bg', [['gironda', 'Gironda'], ['mine', 'My photo'], ['none', 'Plain']], st.background, 'Background')}
    <label class="btn">Choose my own background photo<input type="file" accept="image/*" class="sr" id="bg-file"></label>
    <p class="muted small">${st.background === 'gironda' ? esc(GIRONDA_CREDIT) : st.background === 'mine' ? (st.bgPhotoId ? 'Your photo, kept only on this phone.' : 'Choose a photo above.') : 'No background photo.'} Your own photo (Mentzer, or anyone) stays on this phone and is never uploaded.</p>
  </section>
  <section class="card">
    <h2>From Trainer</h2>
    <p class="small">Copy from the Trainer app in this browser. Trainer itself is never changed.</p>
    <div class="grid2"><button data-act="trainer-chains">Copy my chains</button><button data-act="trainer-all">Copy everything…</button></div>
    <p class="muted small"><b>Chains</b> adds your own "No ___" chains, their check-ins and your no-coffee start, and keeps everything else here. <b>Everything</b> replaces this app's data with Trainer's.</p>
  </section>
  <section class="card">
    <h2>Reminders</h2>
    <p class="small">A calendar file with a daily weigh-in, your carb-up days for the next 12 weeks and your training days. Import it into Google Calendar (Settings → Import) and the phone reminds you, even offline.</p>
    <div class="grid2"><label class="field">Weigh-in time<input id="rm-weighTime" type="time" value="${esc(st.weighTime)}"></label><label class="field">Training time<input id="rm-trainTime" type="time" value="${esc(st.trainTime)}"></label></div>
    <button data-act="ics">Download calendar file</button>
    <p class="muted small">Training days come from your week plan (Plan → Week) when set, otherwise Mon, Tue, Thu and Fri for the 4-day split. Download again after changing the carb-up interval.</p>
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
      <div>Chains, per day kept: ${allChains().map((c) => `${c.name} +${c.pts}`).join(' · ')}</div>
      <div>Daily tasks done (steps, training, protein, fluids, sleep, plan, journal) +${QUEST_BASE} each · sweat-suit bonus +${PTS.sweat} · weekly step target +${PTS.stepsWeek}</div>
      <div>Daily goal +${PTS.goal1} each · all daily goals done +${PTS.goalAll} · weekly goal reached +${PTS.goalWeek}</div>
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

function goalRow(date, g) {
  return `<div class="row between goalrow"><button class="check grow" role="checkbox" aria-checked="${g.done}" data-act="dg-tick" data-date="${date}" data-id="${esc(g.id)}" data-rec="${g.recurring ? 1 : 0}">
    <span class="box" aria-hidden="true">${g.done ? '✓' : ''}</span><span class="grow ${g.done ? 'struck' : ''}">${esc(g.text)}${g.when ? ` <span class="chip">⏱ ${esc(g.when)}</span>` : ''}${g.why ? `<br><span class="muted small">${esc(g.why)}</span>` : ''}${g.ifThen ? `<br><span class="small ifthen">↳ ${esc(g.ifThen)}</span>` : ''}</span><span class="catg">${esc(catName(g.cat))}</span></button>
    ${g.recurring ? '' : `<button class="icon ghost" data-act="dg-del" data-date="${date}" data-id="${esc(g.id)}" aria-label="Delete goal">✕</button>`}</div>`;
}

function weekGoalRow(ws, g) {
  return `<div class="wgoal"><div class="row between"><span class="grow"><b>${esc(g.text)}</b> <span class="catg">${esc(catName(g.cat))}</span>${g.why ? `<br><span class="muted small">${esc(g.why)}</span>` : ''}</span>
    <b class="nowrap ${g.reached ? 'good-text' : ''}">${g.count}/${g.target}${g.reached ? ' ✓' : ''}</b></div>
    ${bar(g.count, g.target, g.reached ? 'good' : '')}
    ${g.auto ? `<p class="muted small">Counts ${esc(WEEK_AUTO[g.auto]?.label || '')}.</p>` : `<div class="row wrap"><button class="small-btn" data-act="wg-inc" data-ws="${ws}" data-id="${esc(g.id)}" data-d="-1" aria-label="Take one off">−1</button><button class="small-btn" data-act="wg-inc" data-ws="${ws}" data-id="${esc(g.id)}" data-d="1">+1 done</button>
    ${g.recurring ? '' : `<button class="small-btn ghost danger" data-act="wg-del" data-ws="${ws}" data-id="${esc(g.id)}">Remove</button>`}</div>`}</div>`;
}

const catOptions = (sel) => GOAL_CATS.map(([k, l]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${l}</option>`).join('');

function viewGoalsToday() {
  const t = today();
  const d = ui.goalDate || t;
  const gs = goalsFor(d);
  const done = gs.filter((g) => g.done).length;
  const recActive = S.goalDefs.daily.filter((g) => g.active !== false).length;
  return `
  ${dateNav('goal-date', d, { max: addDays(t, 1) })}
  <section class="card">
    <h2>Daily goals <span class="right">${done}/${gs.length}</span></h2>
    ${gs.length ? bar(done, gs.length, done === gs.length ? 'good' : '') + `<div class="list">${gs.map((g) => goalRow(d, g)).join('')}</div>` : '<p class="muted">No goals for this day yet. Add one below, or plan tomorrow\'s top 3 in Plan.</p>'}
    <form id="dgoal-form" class="grid2" data-date="${d}" data-smart data-smart-tap="" autocomplete="off">
      <label class="field" style="grid-column:1/-1">New goal<input name="text" required maxlength="100" placeholder="Something you can finish today" data-sm="text"></label>
      <label class="field">When<input name="when" maxlength="40" placeholder="e.g. after Meal 1" data-sm="when"></label>
      <label class="field">Area<select name="cat">${catOptions('build')}</select></label>
      <label class="field" style="grid-column:1/-1">Why<input name="why" maxlength="140" placeholder="The reason, for the days you don't feel like it" data-sm="why"></label>
      <label class="field check-field" style="grid-column:1/-1"><span>Every day</span><input name="every" type="checkbox"></label>
      <div class="smart-wrap" style="grid-column:1/-1">${smartStrip(null)}</div>
      <button class="primary" style="grid-column:1/-1" type="submit">Add goal</button>
    </form>
    ${recActive > DAILY_SOFT_CAP ? `<p class="small warn-text">⚠ ${recActive} goals every day. Each extra one lowers the odds of finishing all of them: keep ${DAILY_SOFT_CAP} must-dos and pause the rest.</p>` : ''}
  </section>
  ${S.goalDefs.daily.length ? `<section class="card"><h2>Every-day goals</h2><div class="list">${S.goalDefs.daily.map((g) => `<div class="row between"><span class="grow ${g.active === false ? 'muted' : ''}">${esc(g.text)} <span class="catg">${esc(catName(g.cat))}</span></span>
    <button class="small-btn" data-act="def-toggle" data-kind="daily" data-id="${esc(g.id)}">${g.active === false ? 'Resume' : 'Pause'}</button>
    <button class="icon ghost" data-act="def-del" data-kind="daily" data-id="${esc(g.id)}" aria-label="Delete">✕</button></div>`).join('')}</div></section>` : ''}`;
}

function viewGoalsWeek() {
  const ws = ui.goalWeek || weekStart(today());
  const gs = weeklyFor(ws);
  const reached = gs.filter((g) => g.reached).length;
  return `
  <div class="row between datenav">
    <button class="icon" data-act="goal-week" data-dir="-7" aria-label="Previous week">‹</button>
    <span class="grow center"><b>Week of ${fmtDate(ws)}</b></span>
    <button class="icon" data-act="goal-week" data-dir="7" aria-label="Next week">›</button>
  </div>
  <section class="card">
    <h2>Weekly goals <span class="right">${reached}/${gs.length} reached</span></h2>
    ${gs.length ? `<div class="list">${gs.map((g) => weekGoalRow(ws, g)).join('')}</div>` : '<p class="muted">No weekly goals yet. Set them at the weekend with your weekly plan.</p>'}
    <form id="wgoal-form" class="grid2" data-ws="${ws}" data-smart data-smart-tap="" data-smart-when="week" autocomplete="off">
      <label class="field" style="grid-column:1/-1">New weekly goal<input name="text" required maxlength="100" placeholder="e.g. Film and upload 2 videos" data-sm="text"></label>
      <label class="field">Times this week<input name="target" inputmode="numeric" value="1"></label>
      <label class="field">Area<select name="cat">${catOptions('wealth')}</select></label>
      <label class="field check-field" style="grid-column:1/-1"><span>Every week</span><input name="every" type="checkbox"></label>
      <label class="field" style="grid-column:1/-1">Why<input name="why" maxlength="140" data-sm="why"></label>
      <div class="smart-wrap" style="grid-column:1/-1">${smartStrip(null)}</div>
      <button class="primary" style="grid-column:1/-1" type="submit">Add weekly goal</button>
    </form>
  </section>
  ${S.goalDefs.weekly.length ? `<section class="card"><h2>Every-week goals</h2><div class="list">${S.goalDefs.weekly.map((g) => `<div class="row between"><span class="grow ${g.active === false ? 'muted' : ''}">${esc(g.text)} · ${g.target || 1}×</span>
    <button class="small-btn" data-act="def-toggle" data-kind="weekly" data-id="${esc(g.id)}">${g.active === false ? 'Resume' : 'Pause'}</button>
    <button class="icon ghost" data-act="def-del" data-kind="weekly" data-id="${esc(g.id)}" aria-label="Delete">✕</button></div>`).join('')}</div></section>` : ''}`;
}

function viewGoalsProfile() {
  return `
  ${S.principles.length ? `<section class="card"><h2>Your operating rules ${S.pack ? `<span class="right">${esc(S.pack.name)}</span>` : ''}</h2>
    <div class="list">${S.principles.map(([h, x]) => `<div><b>${esc(h)}</b><br><span class="muted small">${esc(x)}</span></div>`).join('')}</div></section>` : ''}
  <section class="card">
    <h2>Import a goal pack</h2>
    <p class="muted small">Paste a goal-pack link or code. It adds daily, weekly and long-term goals and your operating rules. Everything stays on this phone.</p>
    <textarea id="pack-text" rows="3" placeholder="Paste the link here"></textarea>
    <div class="grid2"><button data-act="pack-import">Import pasted link</button>
      <label class="btn">Import from file<input type="file" accept=".txt,.json,text/plain,application/json" id="pack-file" class="sr"></label></div>
    ${S.pack ? `<p class="muted small">Last imported: ${esc(S.pack.name)} · ${fmtDate(S.pack.at.slice(0, 10))}</p>` : ''}
  </section>`;
}

function viewHeroGoals() {
  const view = ui.goalView;
  const inner = { today: viewGoalsToday, week: viewGoalsWeek, long: viewLongGoals, profile: viewGoalsProfile }[view]();
  return segmented('goal-view', [['today', 'Daily'], ['week', 'Weekly'], ['long', 'Long-term'], ['profile', 'Rules']], view, 'Goal view') + inner;
}

function viewLongGoals() {
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

function dreamCard(d) {
  const dr = S.dreams[d] || {};
  const past = Object.keys(S.dreams).filter((x) => x !== d && !S.dreams[x].none).sort().reverse().slice(0, 5);
  const logged = Object.values(S.dreams).filter((x) => !x.none).length;
  return `<section class="card" id="dream-diary">
    <h2>Dream diary · last night <span class="right">${logged} logged</span></h2>
    <p class="muted small">Write it within a few minutes of waking, before your phone pulls you away. Dreams are often more vivid in the weeks after quitting cannabis, as REM sleep rebounds.</p>
    <form id="dream-form" class="grid1" autocomplete="off">
      <input type="hidden" name="date" value="${d}">
      <textarea name="text" rows="4" maxlength="3000" placeholder="People, places, feelings, anything odd…">${esc(dr.text || '')}</textarea>
      <div class="grid2">
        <label class="field">Vividness<select name="vivid"><option value="">—</option>${[1, 2, 3, 4, 5].map((n) => `<option ${dr.vivid === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field check-field"><span>Lucid (knew I was dreaming)</span><input name="lucid" type="checkbox" ${dr.lucid ? 'checked' : ''}></label>
      </div>
      <label class="field check-field"><span>No dream remembered</span><input name="none" type="checkbox" ${dr.none ? 'checked' : ''}></label>
      <button type="submit">${dr.at ? 'Update' : `Save dream · +${PTS.dream} XP`}</button>
    </form>
    ${past.length ? `<details class="small"><summary>Recent dreams</summary><div class="list">${past.map((x) => `<div><b>${fmtDate(x)}</b>${S.dreams[x].vivid ? ` · vivid ${S.dreams[x].vivid}/5` : ''}${S.dreams[x].lucid ? ' · lucid' : ''}<br><span class="muted">${esc(S.dreams[x].text)}</span></div>`).join('')}</div></details>` : ''}
  </section>`;
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
  ${dreamCard(d)}
  <section class="card">
    <h2>Weekly review · week of ${fmtDate(ws)}</h2>
    <div class="stats">
      <div class="stat"><b>${sm.coffee}/${sm.days}</b><span>Coffee-free</span></div>
      <div class="stat"><b>${sm.diet}/${sm.days}</b><span>Diet dialled in</span></div>
      <div class="stat"><b>${sm.sessions}</b><span>Sessions</span></div>
      <div class="stat"><b>${sm.sleep ?? '—'}</b><span>Avg sleep (h)</span></div>
      <div class="stat"><b>${gAvg('rhr', addDays(ws, 6), 7) != null ? Math.round(gAvg('rhr', addDays(ws, 6), 7)) : '—'}</b><span>Avg resting HR</span></div>
      <div class="stat"><b>${gAvg('stress', addDays(ws, 6), 7) != null ? Math.round(gAvg('stress', addDays(ws, 6), 7)) : '—'}</b><span>Avg stress</span></div>
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

// ===========================================================================
// CHANNEL (YouTube)
// ===========================================================================
const VIDEO_STATUS = [['idea', 'Idea'], ['filming', 'Filming'], ['editing', 'Editing'], ['published', 'Published']];
const VIDEO_TYPES = ['Progress update', 'Workout', 'Recipe', 'Fasting', 'Mindset', 'Vlog'];
function youtubeId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/))([\w-]{11})/);
  return m ? m[1] : null;
}
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');

// Talking points for this week's progress video, straight from your logs.
function progressScript() {
  const t = today();
  const ws = weekStart(t);
  const lines = [];
  const dayNo = daysBetween(chainStart(), t) + 1;
  lines.push(dayNo > 0 ? `Day ${dayNo} since the restart on ${fmtDate(chainStart())}.` : `The restart begins ${fmtDate(chainStart())}.`);
  // Weight counts from the first day of any chain, so this week's weigh-ins are included.
  const firstW = [...S.weights].filter((w) => w.date >= firstStart()).sort((a, b) => a.date.localeCompare(b.date))[0];
  const avg = avgWeight(t, 7);
  if (avg != null) lines.push(`Weight: ${round1(avg)} kg (7-day average)${firstW ? `, ${round1(firstW.kg - avg) >= 0 ? 'down' : 'up'} ${Math.abs(round1(firstW.kg - avg))} kg since ${fmtDate(firstW.date)}` : ''}. Goal ${S.settings.target} kg.`);
  const c = (id) => chainStreak(id);
  lines.push(`No coffee: ${c('coffee').cur} days in a row (best ${c('coffee').best}).`);
  lines.push(`Diet dialled in: ${c('diet').cur} days running, eating ${win().from}–${win().to}.`);
  const sw = stepsWeek(ws);
  lines.push(`Steps this week: ${sw.total.toLocaleString('en-GB')} (${sw.count} day${sw.count === 1 ? '' : 's'} at ${S.settings.stepGoal.toLocaleString('en-GB')}).`);
  const wk = S.workouts.filter((w) => w.date >= ws);
  const prs = prSessions();
  lines.push(`Training this week: ${wk.length} session${wk.length === 1 ? '' : 's'}${wk.some((w) => prs.has(w.id)) ? ', with a new personal record' : ''}.`);
  const fasts = S.fasts.filter((f) => f.end && f.end.slice(0, 10) >= ws);
  if (fasts.length) lines.push(`Longest fast this week: ${Math.floor(Math.max(...fasts.map(fastHours)))} hours.`);
  const gs = weeklyFor(ws);
  if (gs.length) lines.push(`Weekly goals: ${gs.filter((g) => g.reached).length} of ${gs.length} reached so far.`);
  lines.push('One lesson from this week: …');
  lines.push('Next week I will: …');
  return lines;
}

function videoCard(v) {
  const id = youtubeId(v.url);
  const url = safeUrl(v.url);
  const idx = VIDEO_STATUS.findIndex(([k]) => k === v.status);
  const next = VIDEO_STATUS[idx + 1];
  return `<div class="video">
    ${id ? `<a class="thumb" href="${esc(url)}" target="_blank" rel="noopener" aria-label="Watch ${esc(v.title)} on YouTube"><img src="https://i.ytimg.com/vi/${id}/mqdefault.jpg" alt="" loading="lazy"><span class="play" aria-hidden="true">▶</span></a>` : ''}
    <div class="row between wrap"><b>${esc(v.title)}</b>${chip(VIDEO_STATUS[idx]?.[1] || v.status, v.status === 'published' ? 'good' : '')}</div>
    <p class="muted small">${esc(v.type)}${v.date ? ` · ${fmtDate(v.date)}` : ''}${v.notes ? ` · ${esc(v.notes)}` : ''}</p>
    <div class="row wrap">
      ${next ? `<button class="small-btn" data-act="video-next" data-id="${esc(v.id)}">→ ${next[1]}${next[0] === 'published' ? ` · +${PTS.video} XP` : ''}</button>` : ''}
      ${url ? `<a class="btn small-btn" href="${esc(url)}" target="_blank" rel="noopener">Open</a>` : ''}
      <button class="small-btn" data-act="video-edit" data-id="${esc(v.id)}">Edit</button>
    </div>
  </div>`;
}

// ---- Apps: the other apps, and one backup for all of them ------------------
const OTHER_APPS = [
  ['daily', 'Council', '/Training/council/', 'Your coach and therapist: talk it through, Self-Authoring, interviews, commitments and the One Thing.'],
  ['tools', 'Deliberation Council', '/Training/deliberation/', 'Big decisions, argued out by four seats.'],
  ['tools', 'MASSA', '/Training/massa/', 'Value betting. Paper only during the cut.'],
  ['old', 'Life RPG', '/Training/liferpg/', 'Merging in here after 1 November.'],
  ['old', 'Shredded System', '/Training/shredded-system/app/', 'Everything is in this app now. Guide PDFs in Body → Guide.'],
  ['old', 'Trainer', '/Training/', 'The original app, kept as a fallback.'],
];
// Every app's saved data in one file. A fixed list, so no API key ever leaves the phone; photos (IndexedDB) aren't included.
const BACKUP_KEYS = ['shtrainer.v1', 'shtrainer.chains', 'shtrainer.drafts', 'council.v1', 'council.sessions.v1', 'liferpg.v1', 'shredded.v1', 'trainer.v1', 'massa.v1', 'trainer.v2-backup', 'shtrainer.v2-backup'];
const BACKUP_NAMES = { 'shtrainer.v1': 'Iron & Eggs', 'council.v1': 'Council', 'council.sessions.v1': 'Deliberation audits', 'liferpg.v1': 'Life RPG', 'shredded.v1': 'Shredded System', 'trainer.v1': 'Trainer', 'massa.v1': 'MASSA' };
const LAST_BACKUP_KEY = 'hq.lastBackup';
const rawKey = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lastBackup = () => rawKey(LAST_BACKUP_KEY);
const backupDue = () => { const l = lastBackup(); return !l || daysBetween(l.slice(0, 10), today()) >= 7; };
function backupAll() {
  const keys = {};
  for (const k of BACKUP_KEYS) { const v = rawKey(k); if (v != null) keys[k] = v; }
  const at = new Date().toISOString();
  downloadText(`iron-eggs-backup-${today()}.json`, JSON.stringify({ kind: 'iron-eggs-backup', v: 1, at, keys }), 'application/json');
  try { localStorage.setItem(LAST_BACKUP_KEY, at); } catch { /* storage blocked */ }
  toast('Backup saved to Downloads. Keep a copy in Google Drive');
}
function restoreAll(txt) {
  let data;
  try { data = JSON.parse(txt); } catch { data = null; }
  if (!data || data.kind !== 'iron-eggs-backup' || !data.keys || typeof data.keys !== 'object') { toast('That isn\'t an Iron & Eggs backup file'); return; }
  const ks = Object.keys(data.keys).filter((k) => BACKUP_KEYS.includes(k) && typeof data.keys[k] === 'string');
  if (!ks.length) { toast('That backup has nothing to restore'); return; }
  ask(`Restore the backup from ${typeof data.at === 'string' ? fmtDate(data.at.slice(0, 10)) : 'an unknown date'}? It replaces the data in: ${ks.map((k) => BACKUP_NAMES[k] || k).join(', ')}.`, 'Restore', () => {
    try { for (const k of ks) localStorage.setItem(k, data.keys[k]); } catch { toast('Couldn\'t restore: storage is full or blocked'); return; }
    // This app saves its state once this returns: make that the restored state, not the old one.
    if (ks.includes(STORE_KEY)) { try { S = normalise(JSON.parse(data.keys[STORE_KEY])); } catch { /* keep going; the reload reads storage */ } }
    location.reload();
  });
}
function viewHeroApps() {
  const card = ([, name, href, desc]) => `<a class="btn applink" href="${href}"><b>${esc(name)}</b><span class="muted small">${esc(desc)}</span></a>`;
  const l = lastBackup();
  const have = BACKUP_KEYS.filter((k) => BACKUP_NAMES[k] && rawKey(k) != null).map((k) => BACKUP_NAMES[k]);
  return `
  <section class="card">
    <h2>Backup <span class="right">${l ? `last ${daysBetween(l.slice(0, 10), today()) === 0 ? 'today' : fmtDate(l.slice(0, 10))}` : 'never'}</span></h2>
    <p class="small">${backupDue() ? '<b>Back up now.</b> ' : ''}Everything lives only in this browser on this phone. One tap saves ${esc(have.join(', ') || 'every app')} to one file. Do it every Sunday and keep the file in Google Drive. Progress photos aren't included.</p>
    <div class="grid2"><button class="primary" data-act="backup-all">Back up everything</button>
      <label class="btn">Restore from a file<input type="file" accept="application/json,.json" id="restore-all" class="sr"></label></div>
  </section>
  <section class="card">
    <h2>Other apps</h2>
    <div class="applinks">${OTHER_APPS.filter(([g]) => g === 'daily').map(card).join('')}</div>
    <h3>Tools</h3>
    <div class="applinks">${OTHER_APPS.filter(([g]) => g === 'tools').map(card).join('')}</div>
    <details><summary class="small">Older apps · being merged, gone after 1 November</summary><div class="applinks">${OTHER_APPS.filter(([g]) => g === 'old').map(card).join('')}</div></details>
  </section>`;
}

function viewHeroChannel() {
  const ch = S.channel;
  const pipeline = S.videos.filter((v) => v.status !== 'published').sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const published = S.videos.filter((v) => v.status === 'published').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return `
  <section class="card">
    <h2>Your channel</h2>
    ${ch.name || ch.url ? `<div class="row between wrap"><h3>${esc(ch.name || 'My channel')}</h3>${safeUrl(ch.url) ? `<a class="btn small-btn" href="${esc(safeUrl(ch.url))}" target="_blank" rel="noopener">Open on YouTube</a>` : ''}</div>
      <p class="muted small">${published.length} published · ${pipeline.length} in the pipeline</p>` : '<p class="small">Add your channel so it\'s one tap away. Film the restart from day 1: the before footage is the part you can\'t get back.</p>'}
    <details ${ch.name ? '' : 'open'}><summary class="small">Channel details</summary>
      <form id="channel-form" class="grid1" autocomplete="off">
        <label class="field">Channel name<input name="name" maxlength="60" value="${esc(ch.name)}"></label>
        <label class="field">Channel link<input name="url" type="url" inputmode="url" placeholder="https://youtube.com/@yourname" value="${esc(ch.url)}"></label>
        <button type="submit">Save channel</button>
      </form></details>
  </section>
  <section class="card">
    <h2>This week's progress video</h2>
    <p class="muted small">Talking points from your logs. Copy them into your notes before you film.</p>
    <ol class="small script">${progressScript().map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
    <button data-act="script-copy">Copy talking points</button>
  </section>
  <section class="card">
    <h2>Add a video or idea</h2>
    <form id="video-form" class="grid2" autocomplete="off">
      <label class="field" style="grid-column:1/-1">Title<input name="title" required maxlength="100" placeholder="Day 1: no coffee, 18:6 and Mentzer"></label>
      <label class="field" style="grid-column:1/-1">YouTube link (once it's up)<input name="url" type="url" inputmode="url" placeholder="https://youtu.be/…"></label>
      <label class="field">Stage<select name="status">${VIDEO_STATUS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label class="field">Type<select name="type">${VIDEO_TYPES.map((x) => `<option>${x}</option>`).join('')}</select></label>
      <label class="field" style="grid-column:1/-1">Date<input name="date" type="date" value="${today()}"></label>
      <button class="primary" style="grid-column:1/-1" type="submit">Add</button>
    </form>
  </section>
  ${pipeline.length ? `<section class="card"><h2>Pipeline <span class="right">${pipeline.length}</span></h2><div class="list">${pipeline.map(videoCard).join('')}</div></section>` : ''}
  ${published.length ? `<section class="card"><h2>Published <span class="right">${published.length}</span></h2><div class="vgrid">${published.map(videoCard).join('')}</div></section>` : ''}
  <section class="card slim"><p class="muted small">Each published video earns +${PTS.video} XP. A weekly goal such as "Publish 1 video" fits here too: set it in Goals → Weekly.</p></section>`;
}

function openVideoEdit(v) {
  openSheet('Edit video', `<form id="video-edit-form" class="grid2" data-id="${esc(v.id)}" autocomplete="off">
    <label class="field" style="grid-column:1/-1">Title<input name="title" required maxlength="100" value="${esc(v.title)}"></label>
    <label class="field" style="grid-column:1/-1">YouTube link<input name="url" type="url" inputmode="url" value="${esc(v.url || '')}"></label>
    <label class="field">Stage<select name="status">${VIDEO_STATUS.map(([k, l]) => `<option value="${k}" ${k === v.status ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field">Type<select name="type">${VIDEO_TYPES.map((x) => `<option ${x === v.type ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    <label class="field">Date<input name="date" type="date" value="${esc(v.date || '')}"></label>
    <label class="field">Notes<input name="notes" maxlength="120" value="${esc(v.notes || '')}"></label>
    <button class="primary" style="grid-column:1/-1" type="submit">Save</button>
    <button type="button" class="ghost danger" style="grid-column:1/-1" data-act="video-del" data-id="${esc(v.id)}">Delete</button>
  </form>`);
}

function viewHeroCalendar() {
  const t = today();
  const cs = firstStart();
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
      if (sel === 'all') { const daily = allChains().filter((c) => c.id !== 'sessions'); const n = daily.filter((c) => chainStatus(ds, c.id) === 'done').length; mark = n || '&nbsp;'; cls = n === daily.length ? 'streak' : ''; }
      else { const s = chainStatus(ds, sel); mark = STATUS_ICON[s] || '·'; cls = s === 'done' ? 'streak' : s === 'miss' ? 'missday' : ''; }
    }
    cells.push(`<button class="${ds === d ? 'sel' : ''} ${off ? 'off' : ''} ${cls}" data-act="cal-date" data-date="${ds}" aria-label="${fmtDate(ds)}">${i}<span class="dots">${mark}</span></button>`);
  }
  const before = d < cs || d > t;
  const o = S.days[d]?.chains || {};
  return `
  <div class="chiprow">${[['all', 'All chains'], ...allChains().map((c) => [c.id, c.name])].map(([k, l]) => `<button class="pchip" data-act="cal-chain" data-v="${k}" aria-pressed="${sel === k}">${esc(l)}</button>`).join('')}</div>
  <section class="card">
    <h2>Your clean streaks</h2>
    <p class="muted small">"No ___" chains you check in each day, like coffee. Set the date you stopped and the days before the app count towards the streak.</p>
    ${(S.customChains || []).length ? `<div class="list">${S.customChains.map((c) => `<form class="cc-form grid2" data-id="${esc(c.id)}" autocomplete="off">
      <label class="field">Chain<input name="name" maxlength="40" value="${esc(c.name)}"></label>
      <label class="field">Clean since<input name="since" type="date" max="${t}" value="${esc(c.since || '')}"></label>
      <button type="submit">Save</button><button type="button" class="ghost danger" data-act="cc-del" data-id="${esc(c.id)}">Delete</button></form>`).join('')}</div>` : ''}
    <form id="cc-new" class="grid2" autocomplete="off">
      <label class="field">New chain<input name="name" required maxlength="40" placeholder="e.g. No energy drinks"></label>
      <label class="field">Clean since<input name="since" type="date" max="${t}"></label>
      <button class="primary" style="grid-column:1/-1" type="submit">Add chain</button>
    </form>
  </section>
  <section class="card">
    <h2>Streaks</h2>
    <div class="list">${allChains().map((c) => { const st = chainStreak(c.id); return `<div class="row between"><span><b>${c.name}</b><br><span class="muted small">${st.days} ${c.id === 'sessions' ? 'sessions' : 'days'} ${c.id === 'steps' ? `at ${S.settings.stepGoal.toLocaleString('en-GB')}` : c.id === 'sessions' ? 'logged' : 'kept'} in total${c.weekly ? ' · counted in weeks' : ''}</span></span><span class="nowrap"><span class="flame ${st.cur ? 'lit' : ''}">${st.cur}${st.unit === 'wk' ? '<small>wk</small>' : ''}</span> <span class="muted small">best ${st.best}</span></span></div>`; }).join('')}</div>
  </section>
  <section class="card">
    <h2>${MON[first.getMonth()]} ${first.getFullYear()}</h2>
    <div class="cal">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x) => `<span class="dow">${x}</span>`).join('')}${cells.join('')}</div>
    <p class="muted small">${sel === 'all' ? `Numbers = chains kept that day. Green = all ${allChains().length}.` : '✓ kept · ✕ broken.'} Chains started ${fmtDate(cs)}.</p>
  </section>
  <section class="card">
    ${dateNav('cal-nav', d)}
    ${before ? `<p class="muted">${d > t ? 'This day hasn\'t happened yet.' : `Chains start on ${fmtDate(cs)}.`}</p>` : `<div class="list">${allChains().map((c) => {
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
  if (scanState) { Scan.stop(); scanState = null; }
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

function openSteps(date) {
  const t = today(), y = addDays(t, -1);
  const d = date === y ? y : t;
  openSheet('Steps', `<form id="steps-form" class="grid1" autocomplete="off">
    <label class="field">Day<select name="date">${[[t, 'Today'], [y, 'Yesterday']].map(([v, l]) => `<option value="${v}" ${v === d ? 'selected' : ''}>${l} · ${fmtDate(v)}</option>`).join('')}</select></label>
    <label class="field">Steps (from Garmin)<input name="steps" inputmode="numeric" placeholder="${stepsOn(d) || S.settings.stepGoal}" value="${stepsOn(d) || ''}"></label>
    <div class="grid2"><button type="button" data-act="steps-quick" data-date="${d}">✓ ${S.settings.stepGoal.toLocaleString('en-GB')} done</button><button class="primary" type="submit">Save</button></div>
    <p class="muted small">Enter the day's total. The week is won with ${S.settings.stepDays} days at ${S.settings.stepGoal.toLocaleString('en-GB')}, or ${S.settings.stepWeek.toLocaleString('en-GB')} steps in total.</p>
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

function confirmPack(p) {
  const n = (x) => (x || []).length;
  const parts = [n(p.daily) && `${n(p.daily)} daily`, n(p.weekly) && `${n(p.weekly)} weekly`, n(p.longterm) && `${n(p.longterm)} long-term goals`, n(p.principles) && `${n(p.principles)} operating rules`, n(p.baselines) && `${n(p.baselines)} starting weights`, n(p.chains) && `${n(p.chains)} clean-streak chains`].filter(Boolean);
  ask(`Import "${p.name || 'goal pack'}"?\n${parts.join(' · ')}.\nNothing you've already logged is changed.`, 'Import', () => {
    applyPack(p);
    if (n(p.daily) || n(p.weekly) || n(p.longterm)) { ui.tab = 'hero'; ui.sub.hero = 'goals'; ui.goalView = 'today'; } else if (n(p.baselines)) ui.tab = 'train';
    toast(n(p.baselines) && !n(p.daily) ? 'Starting weights loaded' : 'Goal pack imported');
  });
}

function showWelcome() {
  openSheet('Welcome to Trainer 3', `
    <p>A clean start for ${fmtDate(chainStart())}. Everything was wiped except <b>the last weight and reps for each exercise</b>, which now show as starting points in Train.</p>
    <ul class="small">
      <li><b>Chains:</b> no coffee first, then diet, training, steps and planning. Miss a day and a chain resets.</li>
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
    case 'body': return { weight: viewBodyWeight, garmin: viewBodyGarmin, measure: viewBodyMeasure, sleep: viewBodySleep, guide: viewBodyGuide, settings: viewBodySettings }[ui.sub.body]();
    case 'hero': return { character: () => viewHeroCharacter(P), goals: viewHeroGoals, journal: viewHeroJournal, calendar: viewHeroCalendar, channel: viewHeroChannel, apps: viewHeroApps }[ui.sub.hero]();
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
  document.getElementById('title').textContent = ui.tab === 'today' ? 'Iron & Eggs' : TABS.find(([k]) => k === ui.tab)[1];
  const subs = SUBTABS[ui.tab];
  document.getElementById('view').innerHTML =
    (subs ? `<div class="subtabs">${segmented('sub', subs, ui.sub[ui.tab], 'Section')}</div>` : '') + viewFor(P);
  document.getElementById('nav').innerHTML = TABS.map(([k, label]) =>
    `<button data-tab="${k}" ${ui.tab === k ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg><span>${label}</span></button>`).join('');
  if (opts.scrollTop) window.scrollTo(0, 0);
  if (ui.tab === 'body' && ui.sub.body === 'measure') fillPhotos();
  writeChainSummary();
  applyBackground();
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
    case 'steps': openSteps(d); return false;
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
  const sess = draft._session || {};
  const w = { id: uid(), date: d, at: new Date().toISOString(), programId: pid, programName: prog.name, family: prog.family, dayId: did, dayName: day.name, entries };
  if (sess.feel) w.feel = Number(sess.feel);
  if ((sess.note || '').trim()) w.note = sess.note.trim();
  S.workouts.push(w);
  delete ui.drafts[draftKey(pid, did)];
  saveDrafts();
  ui.dayId = null;
  const prs = prSessions();
  const last = S.workouts[S.workouts.length - 1];
  toast(prs.has(last.id) ? `Session complete · new personal record! +${PTS.session + PTS.pr} XP` : `Session complete · +${PTS.session} XP`);
}

function restoreFrom(txt) {
  let data;
  try { data = JSON.parse(txt || ''); } catch { data = null; }
  if (!data || !data.settings || ![1, 2, 3].includes(data.v || 1)) { toast('That is not a Trainer or Shredded Trainer backup'); return; }
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
    case 'garmin-date': { const dir = Number(el.dataset.dir); const t = today(); ui.garminDate = dir === 0 ? t : addDays(ui.garminDate || t, dir); if (ui.garminDate > t) ui.garminDate = t; render(); return; }
    case 'garmin-edit': ui.garminDate = el.dataset.date; render(); document.getElementById('garmin-form')?.scrollIntoView({ block: 'center' }); return;
    case 'garmin-del': ask(`Delete Garmin data for ${fmtDate(el.dataset.date)}? Steps and sleep logs stay.`, 'Delete', () => { delete S.garmin[el.dataset.date]; }); return;
    case 'video-next': {
      const v = S.videos.find((x) => x.id === el.dataset.id);
      const i = VIDEO_STATUS.findIndex(([k]) => k === v.status);
      const nx = VIDEO_STATUS[i + 1]?.[0];
      if (nx === 'published' && !safeUrl(v.url)) { openVideoEdit({ ...v, status: 'published' }); toast('Add the YouTube link, then save'); return; }
      if (nx) { v.status = nx; if (nx === 'published') { v.date = today(); toast(`Published · +${PTS.video} XP`); } }
      break;
    }
    case 'video-edit': openVideoEdit(S.videos.find((x) => x.id === el.dataset.id)); return;
    case 'video-del': S.videos = S.videos.filter((x) => x.id !== el.dataset.id); closeSheet(); toast('Video removed'); break;
    case 'script-copy': copyText(progressScript().map((x, i) => `${i + 1}. ${x}`).join('\n'), 'Talking points copied'); return;
    case 'steps-open': openSteps(el.dataset.date || today()); return;
    case 'steps-quick': {
      const d = document.querySelector('#steps-form [name=date]')?.value || el.dataset.date;
      const r = dayRec(d); r.steps = Math.max(r.steps || 0, S.settings.stepGoal); r.stepsAt = nowOn(d);
      closeSheet(); toast('Steps goal logged'); break;
    }
    case 'sweat': { const r = dayRec(today()); r.sweat = !r.sweat; if (r.sweat) toast(`Sweat suit · +${PTS.sweat} XP · fluid target +${S.settings.walkExtraMl} ml`); break; }
    case 'go-fuel': ui.tab = 'fuel'; ui.sub.fuel = 'log'; ui.fuelDate = today(); rememberUi(); render({ scrollTop: true }); return;
    case 'go-goals': ui.tab = 'hero'; ui.sub.hero = 'goals'; ui.goalView = el.dataset.v || 'today'; if (el.dataset.ws) ui.goalWeek = el.dataset.ws; rememberUi(); render({ scrollTop: true }); return;
    case 'goal-view': ui.goalView = el.dataset.v; render(); return;
    case 'goal-date': { const dir = Number(el.dataset.dir); const t = today(); ui.goalDate = dir === 0 ? t : addDays(ui.goalDate || t, dir); if (ui.goalDate > addDays(t, 1)) ui.goalDate = addDays(t, 1); render(); return; }
    case 'goal-week': ui.goalWeek = addDays(ui.goalWeek || weekStart(today()), Number(el.dataset.dir)); render(); return;
    case 'dg-tick': {
      const d = el.dataset.date, id = el.dataset.id;
      if (el.dataset.rec === '1') { const t = (dayRec(d).dg ||= {}); if (t[id]) delete t[id]; else t[id] = true; }
      else { const g = (S.dayGoals[d] || []).find((x) => x.id === id); if (g) g.done = !g.done; }
      const gs = goalsFor(d);
      if (gs.length && gs.every((g) => g.done)) toast(`All daily goals done · +${PTS.goalAll} XP`);
      break;
    }
    case 'dg-del': S.dayGoals[el.dataset.date] = (S.dayGoals[el.dataset.date] || []).filter((g) => g.id !== el.dataset.id); break;
    case 'wg-inc': {
      const c = (S.weekCounts[el.dataset.ws] ||= {});
      c[el.dataset.id] = Math.max(0, (c[el.dataset.id] || 0) + Number(el.dataset.d));
      const g = weeklyFor(el.dataset.ws).find((x) => x.id === el.dataset.id);
      if (g?.reached && Number(el.dataset.d) > 0 && g.count === g.target) toast(`Weekly goal reached · +${PTS.goalWeek} XP`);
      break;
    }
    case 'wg-del': S.weekGoals[el.dataset.ws] = (S.weekGoals[el.dataset.ws] || []).filter((g) => g.id !== el.dataset.id); break;
    case 'def-toggle': { const g = S.goalDefs[el.dataset.kind].find((x) => x.id === el.dataset.id); g.active = g.active === false; break; }
    case 'def-del': {
      const g = S.goalDefs[el.dataset.kind].find((x) => x.id === el.dataset.id);
      ask(`Delete "${g.text}"? Past ticks stop counting for XP.`, 'Delete', () => { S.goalDefs[el.dataset.kind] = S.goalDefs[el.dataset.kind].filter((x) => x.id !== g.id); });
      return;
    }
    case 'pack-import': {
      decodePack(document.getElementById('pack-text')?.value).then((p) => {
        if (p) confirmPack(p);
        else toast('That link looks cut short. Try the file instead: Import from file');
      });
      return;
    }
    case 'tick': {
      const k = el.dataset.k;
      const before = checklistFor(today());
      const was = before.find((x) => x.k === k)?.done;
      const r = onTick(k);
      if (r === 'none' || r === 'sheet') return;
      if (r === 'nav') { rememberUi(); render({ scrollTop: true }); return; }
      commit();
      const after = checklistFor(today());
      const now = after.find((x) => x.k === k)?.done;
      if (now && !was) {
        const perfect = after.every((x) => x.done);
        celebrateTick(k, perfect);
        if (perfect) toast(`Perfect day · ${after.length}/${after.length} · +${PTS.perfect} XP`);
      }
      return;
    }
    case 'go-dream': ui.tab = 'hero'; ui.sub.hero = 'journal'; rememberUi(); render(); document.getElementById('dream-diary')?.scrollIntoView(); return;
    case 'go-train': ui.tab = 'train'; rememberUi(); render({ scrollTop: true }); return;
    case 'go-drinks': ui.tab = 'fuel'; ui.sub.fuel = 'fluids'; ui.fuelDate = today(); rememberUi(); render(); document.querySelector('.drinks')?.scrollIntoView(); return;
    case 'go-sleep': ui.tab = 'body'; ui.sub.body = 'sleep'; rememberUi(); render({ scrollTop: true }); return;
    case 'refeed': { const r = dayRec(el.dataset.date || today()); if (r.refeed) delete r.refeed; else { r.refeed = true; toast('Carb-up day: carbs up, protein the same, window still on'); } break; }
    case 'refeed-snooze': { const r = dayRec(today()); r.refeedSnooze = true; break; }
    case 'rate': { const r = dayRec(el.dataset.date || today()); const k = el.dataset.k, v = Number(el.dataset.v); if (r[k] === v) delete r[k]; else r[k] = v; break; }
    case 'symptom': { const r = dayRec(el.dataset.date || today()); const set = new Set(r.symptoms || []); if (set.has(el.dataset.v)) set.delete(el.dataset.v); else set.add(el.dataset.v); r.symptoms = [...set]; if (!r.symptoms.length) delete r.symptoms; break; }
    case 'apply-kcal': { S.settings.kcalGoal = Math.max(KCAL_FLOOR, S.settings.kcalGoal + Number(el.dataset.v)); toast(`Calorie target now ${S.settings.kcalGoal} kcal`); break; }
    case 'photo-del': ask('Delete this photo?', 'Delete', () => { Photos.remove(el.dataset.id).then(() => render(), () => toast('Couldn\'t delete it')); }); return;
    case 'scan-food': scanSheet(); return;
    case 'scan-cam': {
      scanState.status = 'camera'; scanState.msg = 'Point the camera at the barcode.'; drawScan();
      Scan.start(document.getElementById('scan-video'), (code) => scanLookup(code)).catch(() => { Scan.stop(); if (scanState) { Object.assign(scanState, { status: 'error', msg: 'The camera isn\'t available. Type the number instead.' }); drawScan(); } });
      return;
    }
    case 'scan-stop': Scan.stop(); Object.assign(scanState, { status: 'idle', msg: '' }); drawScan(); return;
    case 'scan-recent': scanLookup(el.dataset.v); return;
    case 'ics': {
      const st = S.settings;
      const from = today() > chainStart() ? today() : chainStart();
      const planned = [...new Set(Object.keys(S.plans).filter((x) => x >= today() && S.plans[x]?.kind === 'train').map((x) => parseDate(x).getDay()))];
      downloadText('shredded-trainer-reminders.ics', Reminders.build({ from, weighTime: st.weighTime, trainTime: st.trainTime, trainDays: planned.length ? planned.sort() : [1, 2, 4, 5], carbupDates: carbupDatesAhead() }), 'text/calendar');
      toast('Calendar file downloaded: import it into your calendar');
      return;
    }
    case 'bg': S.settings.background = el.dataset.v; break;
    case 'trainer-all': ask('Replace everything in Shredded Trainer with a copy of your Trainer data? Trainer isn\'t changed.', 'Copy everything', () => bringTrainer()); return;
    case 'trainer-chains': {
      let t = null;
      try { t = JSON.parse(localStorage.getItem(TRAINER_KEY)); } catch { t = null; }
      if (!t || typeof t !== 'object') { toast('No Trainer data found in this browser'); return; }
      let added = 0, marks = 0;
      for (const c of Array.isArray(t.customChains) ? t.customChains : []) {
        if (!c || typeof c.name !== 'string') continue;
        if (!S.customChains.some((x) => x.id === c.id || x.name.toLowerCase() === c.name.toLowerCase())) { S.customChains.push({ ...c }); added++; }
      }
      // Chain check-ins (kept / slipped) for days this app hasn't set itself.
      for (const [d, r] of Object.entries(t.days && typeof t.days === 'object' ? t.days : {})) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !r?.chains || typeof r.chains !== 'object') continue;
        for (const [id, v] of Object.entries(r.chains)) if ((v === true || v === false) && dayRec(d).chains?.[id] === undefined) { (dayRec(d).chains ||= {})[id] = v; marks++; }
      }
      if (t.settings?.coffeeStart && /^\d{4}-\d{2}-\d{2}$/.test(t.settings.coffeeStart)) S.settings.coffeeStart = t.settings.coffeeStart;
      toast(`Copied ${added} chain${added === 1 ? '' : 's'} and ${marks} check-in${marks === 1 ? '' : 's'} from Trainer`);
      break;
    }
    case 'bring-trainer': bringTrainer(); closeSheet(); break;
    case 'go-plan': ui.tab = 'plan'; ui.sub.plan = 'tomorrow'; ui.planDate = addDays(today(), 1); rememberUi(); render({ scrollTop: true }); return;
    case 'clean': {
      const c = (dayRec(today()).chains ||= {});
      const id = el.dataset.chain, v = el.dataset.v === '1';
      if (c[id] === v) delete c[id]; else c[id] = v;
      const name = chainDef(id)?.name || 'Chain';
      if (c[id] === true) toast(`${name} · day ${chainStreak(id).cur + 1} kept`);
      if (c[id] === false) toast(`${name} reset. A slip is data, not a verdict: day 1 is tomorrow`);
      break;
    }
    case 'cc-del': {
      const cc = S.customChains.find((x) => x.id === el.dataset.id);
      ask(`Delete the "${cc.name}" chain? Its history goes too.`, 'Delete', () => { S.customChains = S.customChains.filter((x) => x.id !== cc.id); });
      return;
    }
    case 'coffee': {
      const c = (dayRec(today()).chains ||= {});
      const v = el.dataset.v === '1';
      if (c.coffee === v) delete c.coffee; else c.coffee = v;
      if (c.coffee === true) toast('Coffee-free · chain kept');
      if (c.coffee === false) toast('Chain reset. Tomorrow is day 1 again');
      break;
    }
    case 'life': {
      const r = (dayRec(today()).life ||= {});
      const k = el.dataset.k;
      if (r[k]) delete r[k]; else { r[k] = true; toast(`${LIFE_AREAS.find(([x]) => x === k)[1]} · a bit done · +${PTS.life} XP`); }
      break;
    }
    case 'go-channel': ui.tab = 'hero'; ui.sub.hero = 'channel'; rememberUi(); render({ scrollTop: true }); return;
    case 'go-mentzer': S.settings.family = 'hit'; S.settings.mentzerSwitched = today(); ui.dayId = null; ui.tab = 'train'; rememberUi(); toast('Mentzer HIT is now your programme'); break;
    case 'cycle-again': S.settings.cycleStart = weekStart(today()); toast('4-week programme restarted: week 1'); break;
    case 'mentzer-later': S.settings.mentzerSnooze = today(); break;
    case 'backup-all': backupAll(); break;
    case 'go-apps': ui.tab = 'hero'; ui.sub.hero = 'apps'; rememberUi(); render({ scrollTop: true }); return;
    case 'chain-mark': {
      const c = (dayRec(today()).chains ||= {});
      const id = el.dataset.chain, v = el.dataset.v === '1';
      if (c[id] === v) delete c[id]; else c[id] = v;
      const name = chainDef(id)?.name || 'Chain';
      if (c[id] === false) toast(`${name} broken today. Day 1 again tomorrow`);
      if (c[id] === true) toast(`${name} · kept`);
      if (c[id] === undefined) toast(`${name} · back to automatic`);
      break;
    }
    case 'eat-mode': {
      const r = dayRec(el.dataset.date || today());
      const v = el.dataset.v;
      r.fast = v === 'fast';
      if (v === 'omad') r.eat = 'omad'; else delete r.eat;
      if (!r.fast) delete r.fast;
      // Switching away from a planned fast day makes it a rest day.
      const pl = S.plans[el.dataset.date || today()];
      if (v !== 'fast' && pl?.kind === 'fast') pl.kind = 'rest';
      toast(v === 'fast' ? 'Fast day: water, tea and electrolytes. Your diet chains count it' : v === 'omad' ? `One meal today: any time, one sitting (within ${OMAD_SITTING_MIN / 60} hours)` : `18:6 today: eat between ${win().from} and ${win().to}`);
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
    case 'plan-sweat': { const p = planRec(el.dataset.date); p.sweat = !p.sweat; break; }
    case 'plan-save': {
      const d = el.dataset.date;
      const p = planRec(d);
      if (!p.kind) { toast('Pick training, rest or fast first'); return; }
      const first = !p.madeAt;
      p.madeAt = new Date().toISOString();
      if (!p.madeOn || first) p.madeOn = today();
      syncTop(d);
      toast(first ? `Plan locked in for ${fmtDate(d)}` : 'Plan updated');
      if (d === addDays(today(), 1)) { ui.tab = 'today'; }
      break;
    }
    case 'smart-self': {
      const d = el.dataset.date, i = el.dataset.i, l = el.dataset.l;
      if (d === undefined || i === undefined) { el.classList.toggle('on'); el.setAttribute('aria-pressed', el.classList.contains('on')); refreshSmart(el.closest('[data-smart]')); return; }
      const p = planRec(d);
      const c = ((p.topCheck ||= {})[i] ||= {});
      c[l] = !c[l];
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
    case 'set-add': case 'set-del': {
      const { ex } = findEx(el.dataset.pid, el.dataset.did, el.dataset.eid);
      const dr = (getDraft(el.dataset.pid, el.dataset.did)[ex.id] ||= {});
      const planned = Math.max(1, Number(ex.sets) || 1);
      const extra = Math.max(0, Number(dr.extra) || 0);
      dr.sets ||= [];
      if (a === 'set-add') {
        // The new set starts at the weight you typed for the set before it.
        const prev = dr.sets[planned + extra - 1];
        dr.sets[planned + extra] = { kg: prev?.kg ?? '', reps: '' };
        dr.extra = extra + 1;
      } else if (extra) {
        dr.sets.length = Math.min(dr.sets.length, planned + extra - 1);
        dr.extra = extra - 1;
      }
      saveDrafts();
      render();
      return;
    }
    case 'feel': {
      const dr = (getDraft(el.dataset.pid, el.dataset.did)._session ||= {});
      dr.feel = Number(dr.feel) === Number(el.dataset.v) ? null : Number(el.dataset.v);
      saveDrafts();
      render();
      return;
    }
    case 'copy-last': {
      const { ex } = findEx(el.dataset.pid, el.dataset.did, el.dataset.eid);
      const last = lastEntryFor(ex.name);
      if (!last) return;
      const mode = logMode(ex);
      const planned = Math.max(1, Number(ex.sets) || 1, mode === 'singles' ? techOf(ex).sets : 1);
      // Extra sets you did last time come back too.
      const n = mode === 'singles' ? planned : Math.max(planned, last.entry.sets.length);
      const dr = (getDraft(el.dataset.pid, el.dataset.did)[ex.id] ||= {});
      dr.extra = n - planned;
      dr.sets = Array.from({ length: n }, (_, s) => {
        const ls = last.entry.sets[s] || last.entry.sets[last.entry.sets.length - 1];
        return { kg: ls?.kg ?? '', reps: ls?.reps ?? '', hold: ls?.hold ?? '' };
      });
      saveDrafts();
      render(); return;
    }
    case 'complete': completeSession(el.dataset.pid, el.dataset.did); break;
    case 'open-session': ui.openSession = ui.openSession === el.dataset.id ? null : el.dataset.id; render(); return;
    case 'del-workout': ask('Delete this session?', 'Delete', () => { S.workouts = S.workouts.filter((w) => w.id !== el.dataset.id); }); return;
    case 'ex-move': {
      const { day, i } = findEx(el.dataset.pid, el.dataset.did, el.dataset.eid);
      S.programs[el.dataset.pid].edited = true;
      const j = i + Number(el.dataset.dir);
      if (j < 0 || j >= day.exercises.length) return;
      [day.exercises[i], day.exercises[j]] = [day.exercises[j], day.exercises[i]];
      break;
    }
    case 'ex-del': {
      const { day, i, ex } = findEx(el.dataset.pid, el.dataset.did, el.dataset.eid);
      ask(`Remove ${ex.name} from this day?`, 'Remove', () => { day.exercises.splice(i, 1); S.programs[el.dataset.pid].edited = true; });
      return;
    }
    case 'ex-add': {
      const prog = S.programs[el.dataset.pid];
      const day = prog.days.find((d) => d.id === el.dataset.did);
      prog.edited = true;
      day.exercises.push({ id: uid(), name: 'New exercise', sets: prog.family === 'hit' ? 1 : 3, reps: prog.family === 'hit' ? '6–10' : '8–12', note: '', ss: false, tech: '' });
      break;
    }
    case 'day-add': {
      const prog = S.programs[el.dataset.pid];
      const nd = { id: uid(), name: `Day ${prog.days.length + 1}`, group: prog.days[prog.days.length - 1]?.group || '', weeks: prog.days[prog.days.length - 1]?.weeks, exercises: [] };
      prog.days.push(nd);
      prog.edited = true;
      ui.dayId = nd.id;
      break;
    }
    case 'day-del': {
      const prog = S.programs[el.dataset.pid];
      ask('Delete this day and its exercises? Logged sessions stay in history.', 'Delete day', () => {
        prog.days = prog.days.filter((d) => d.id !== el.dataset.did); ui.dayId = null; prog.edited = true;
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
        () => { S = cleanSlate(S, false); ui.drafts = {}; saveDrafts(); toast('All data reset'); },
        { label: 'Keep exercise weights', run: () => { S = cleanSlate(S, true); ui.drafts = {}; saveDrafts(); toast('Reset · exercise weights kept'); } });
      return;
    case 'restore-paste': restoreFrom(document.getElementById('restore-text')?.value.trim()); return;
    case 'export': {
      const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement('a'), { href: url, download: `shredded-trainer-backup-${today()}.json` });
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
  if (t.dataset.sm) {
    const box = t.closest('[data-smart]');
    if (box) refreshSmart(box);
    return;
  }
  if (t.dataset.live === 'picker-q') {
    const q = t.value.trim().toLowerCase();
    document.querySelectorAll('.picker-list .pick').forEach((b) => { b.hidden = !!q && !b.dataset.name.includes(q); });
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'bg-file') {
    const file = t.files?.[0];
    if (file) Photos.add(today(), 'background', file).then((p) => { const old = S.settings.bgPhotoId; S.settings.bgPhotoId = p.id; S.settings.background = 'mine'; if (old) Photos.remove(old).catch(() => {}); commit(); toast('Background set'); }, () => toast('Couldn\'t save the photo'));
    return;
  }
  if (t.id === 'cut-med') { const r = dayRec(t.dataset.date || today()); const v = t.value.trim(); if (v) r.med = v; else delete r.med; commit(); return; }
  if (t.id?.startsWith('rm-')) { if (/^\d{2}:\d{2}$/.test(t.value)) { S.settings[t.id.slice(3)] = t.value; commit(); } return; }
  if (t.classList?.contains('photo-in')) {
    const file = t.files?.[0];
    if (file) Photos.add(today(), t.dataset.pose, file).then(() => { S.lastPhoto = today(); commit(); toast('Photo saved'); }, () => toast('Couldn\'t save the photo: the browser may be out of space'));
    return;
  }
  if (t.id === 'pack-file') {
    const file = t.files?.[0];
    if (file) file.text().then(decodePack).then((p) => (p ? confirmPack(p) : toast('That file isn\'t a goal pack'))).catch(() => toast('Could not read that file'));
    t.value = '';
    return;
  }
  if (t.id === 'restore-all') {
    const file = t.files?.[0];
    if (file) file.text().then(restoreAll).catch(() => toast('Could not read that file'));
    t.value = '';
    return;
  }
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
    const [d, i, field = 'text'] = t.dataset.plantop.split('|');
    const p = planRec(d);
    const key = { text: 'top', when: 'topWhen', why: 'topWhy' }[field];
    (p[key] ||= ['', '', ''])[Number(i)] = t.value.trim();
    if (p.madeAt) syncTop(d);
    save();
    if (field === 'text' && Number(i) === 0) render();
    return;
  }
  if (t.dataset.planwoop) {
    const [d, field] = t.dataset.planwoop.split('|');
    const p = planRec(d);
    (p.woop ||= {})[field] = t.value.trim();
    if (p.madeAt) syncTop(d);
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
    const { prog, day, ex } = findEx(t.dataset.pid, t.dataset.did, t.dataset.eid);
    const f = t.dataset.edit;
    if (prog) prog.edited = true;
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
  if (f.id === 'scan-form') { scanLookup(document.getElementById('x-code').value.trim()); return; }
  if (f.id === 'scan-add') {
    const food = scanState?.food, g = num(document.getElementById('x-sg').value);
    if (!food) return;
    if (!g || g <= 0 || g > 3000) { toast('Enter the grams you ate'); return; }
    addMealFromFood({ id: `scan:${food.code}`, name: `${round1(g)} g ${food.name.split(' · ')[0]}`, kcal: food.kcal, p: food.p, c: food.c, f: food.f, kind: 'scan' }, g / 100);
    closeSheet(); commit(); toast('Added to the log');
    return;
  }
  if (f.classList.contains('cc-form')) {
    const cc = S.customChains.find((x) => x.id === f.dataset.id);
    cc.name = (data.name || '').trim() || cc.name;
    cc.since = data.since || null;
    toast('Chain saved');
    commit();
    return;
  }
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
    case 'cc-new': {
      const name = (data.name || '').trim();
      if (!name) return toast('Name the chain');
      S.customChains.push({ id: `cc-${uid()}`, name, since: data.since || null, created: today(), active: true });
      toast(`${name} added`);
      break;
    }
    case 'dream-form': {
      const d = data.date || today();
      const text = (data.text || '').trim();
      if (!text && !data.none) return toast('Write what you remember, or tick "No dream remembered"');
      S.dreams[d] = { text, vivid: num(data.vivid), lucid: !!data.lucid, none: !!data.none, at: S.dreams[d]?.at || new Date().toISOString() };
      toast('Dream saved');
      break;
    }
    case 'channel-form': {
      const url = (data.url || '').trim();
      if (url && !safeUrl(url)) return toast('Paste the full link, starting https://');
      S.channel = { name: (data.name || '').trim(), url };
      toast('Channel saved');
      break;
    }
    case 'video-form': case 'video-edit-form': {
      const title = (data.title || '').trim();
      const url = (data.url || '').trim();
      if (!title) return toast('Give it a title');
      if (url && !safeUrl(url)) return toast('Paste the full link, starting https://');
      const row = { title, url, status: data.status, type: data.type, date: data.date || today() };
      if (f.id === 'video-edit-form') { Object.assign(S.videos.find((x) => x.id === f.dataset.id), row, { notes: (data.notes || '').trim() }); closeSheet(); }
      else S.videos.push({ id: uid(), notes: '', ...row });
      toast(row.status === 'published' ? `Published · +${PTS.video} XP` : 'Saved');
      break;
    }
    case 'garmin-form': {
      const d = f.dataset.date || today();
      const row = {};
      for (const [k] of GARMIN_FIELDS) { const v = num(data[k]); if (v !== null && v >= 0) row[k] = v; }
      if (!Object.keys(row).length) return toast('Enter at least one value');
      if (row.steps != null) { const r = dayRec(d); r.steps = Math.round(row.steps); r.stepsAt ||= nowOn(d); delete row.steps; }
      if (row.sleepH != null && (!sleepOn(d) || sleepOn(d).notes === 'From Garmin')) {
        S.sleep = S.sleep.filter((x) => x.date !== d);
        S.sleep.push({ date: d, at: nowOn(d), hours: round1(row.sleepH), quality: row.sleepScore != null ? Math.max(1, Math.min(10, Math.round(row.sleepScore / 10))) : 7, notes: 'From Garmin' });
      }
      if (Object.keys(row).length) S.garmin[d] = row; else delete S.garmin[d];
      toast(`Garmin saved for ${d === today() ? 'today' : fmtDate(d)}`);
      break;
    }
    case 'dgoal-form': case 'wgoal-form': {
      const text = (data.text || '').trim();
      if (!text) return toast('Write the goal first');
      const weekly = f.id === 'wgoal-form';
      const row = { id: uid(), text, cat: data.cat, why: (data.why || '').trim() };
      if (!weekly && (data.when || '').trim()) row.when = data.when.trim();
      if (weekly) row.target = Math.max(1, Math.min(50, Math.round(num(data.target) || 1)));
      if (data.every) S.goalDefs[weekly ? 'weekly' : 'daily'].push({ ...row, active: true, from: weekly ? f.dataset.ws : f.dataset.date });
      else if (weekly) (S.weekGoals[f.dataset.ws] ||= []).push(row);
      else (S.dayGoals[f.dataset.date] ||= []).push({ ...row, done: false });
      toast('Goal added');
      break;
    }
    case 'steps-form': {
      const n = Math.round(num(data.steps) ?? -1);
      if (n < 0 || n > 150000) return toast('Enter your step count');
      const r = dayRec(data.date || today());
      r.steps = n; r.stepsAt = nowOn(data.date || today());
      closeSheet();
      toast(n >= S.settings.stepGoal ? `${n.toLocaleString('en-GB')} steps · goal hit` : `${n.toLocaleString('en-GB')} steps saved`);
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
    case 'quick-log': {
      const d = today(), kg = num(data.kg), h = num(data.hours);
      if (kg === null && h === null) return toast('Enter your weight or sleep');
      if (kg !== null && (kg < 30 || kg > 250)) return toast('Enter a weight in kg');
      if (h !== null && (h < 0 || h > 16)) return toast('Enter sleep in hours');
      const done = [];
      if (kg !== null) { S.weights = S.weights.filter((w) => w.date !== d); S.weights.push({ date: d, kg: round1(kg) }); done.push(`${round1(kg)} kg`); }
      if (h !== null) { const prev = sleepOn(d); S.sleep = S.sleep.filter((x) => x.date !== d); S.sleep.push({ date: d, at: prev?.at || new Date().toISOString(), hours: round1(h), quality: prev?.quality ?? null, notes: prev?.notes || '' }); done.push(`${round1(h)} h sleep`); }
      toast(`Saved: ${done.join(', ')}`);
      break;
    }
    case 'weight-form': {
      const kg = num(data.kg);
      if (kg === null || kg < 30 || kg > 250) return toast('Enter a weight in kg');
      const d = data.date || today();
      S.weights = S.weights.filter((w) => w.date !== d);
      S.weights.push({ date: d, kg: round1(kg) });
      if (document.querySelector('.sheet #weight-form')) { closeSheet(); toast(`${round1(kg)} kg logged`); }
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
      if (document.querySelector('.sheet #meas-form')) { closeSheet(); toast('Measurements saved'); }
      break;
    }
    case 'settings-form': {
      for (const k of ['proteinGoal', 'kcalGoal', 'carbGoal', 'fatGoal', 'fluidMl', 'walkExtraMl', 'stepGoal', 'stepDays', 'stepWeek', 'sleepGoal', 'carbupHours', 'startWeight', 'target', 'goalLow', 'heightCm']) {
        const v = num(data[k]);
        if (v !== null && v >= 0) S.settings[k] = v;
      }
      if (data.cycleStart) S.settings.cycleStart = data.cycleStart;
      if (data.chainStart) S.settings.chainStart = data.chainStart;
      if (data.coffeeStart) S.settings.coffeeStart = data.coffeeStart;
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

function showStart() {
  let hasTrainer = false;
  try { hasTrainer = !!localStorage.getItem(TRAINER_KEY); } catch { hasTrainer = false; }
  openSheet('Welcome to Iron & Eggs', `
    <p>Trainer and Shredded System in one app, set up for the cut: <b>My 4-Week Program</b> paired with the <b>Gironda diet</b>, a carb-up every ${S.settings.carbupHours} hours, and a ${S.settings.goalLow}–${S.settings.target} kg goal.</p>
    <ul class="small">
      <li>All of Trainer: chains, both programme families, the eating window and fasts, recipes, goals, journal and Garmin.</li>
      <li>From Shredded System: the carb-up clock, a 10-second cut check-in with red-flag symptoms, the weekly decision and timeline (Body → Weight), progress photos (Body → Tape), barcode scanning (Fuel) and calendar reminders (Body → Setup).</li>
    </ul>
    ${hasTrainer ? `<p class="small">Bring over your Trainer history? Weigh-ins, sessions and exercise weights, meals, chains, goals and journal are copied in. Trainer itself isn't changed, and the two apps keep separate data from then on.</p>
      <div class="grid2"><button class="primary" data-act="bring-trainer">Bring over my Trainer data</button><button data-act="sheet-close">Start fresh</button></div>`
      : '<button class="primary" data-act="sheet-close">Start</button>'}`);
}
render();
if (S.notice === 'v3') showWelcome();
if (S.notice === 'start') showStart();
function importFromHash() {
  if (!location.hash.startsWith('#import=')) return;
  const hash = location.hash;
  try { history.replaceState(null, '', location.pathname + location.search); } catch { /* ignore */ }
  decodePack(hash).then((p) => { if (p) confirmPack(p); else toast('That goal-pack link is damaged'); });
}
importFromHash();
window.addEventListener('hashchange', importFromHash);
setInterval(tick, 30000);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').then((r) => r.update()).catch(() => {}));
  // When a new version takes over, reload once so it's used straight away.
  if (navigator.serviceWorker.controller) {
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
  }
}
