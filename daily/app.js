// Daily: one screen a day on top of Iron & Eggs (gym-fuel/) and The Floor (floor/).
// It keeps no data of its own. Both apps live on the same site, so they share this browser's localStorage:
// Daily reads their data fresh on every render and writes each change straight back into it, so a tick here
// shows in The Floor and a meal logged here shows in Iron & Eggs (and the other way round).
(function () {
'use strict';
const $ = (id) => document.getElementById(id);
const TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const x = parseKey(k); x.setDate(x.getDate() + n); return keyOf(x); };
const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 864e5);
const weekStart = (k) => addDays(k, -((parseKey(k).getDay() + 6) % 7)); // Monday
const fmt = (k, opts) => parseKey(k).toLocaleDateString('en-GB', opts || { weekday: 'short', day: 'numeric', month: 'short' });
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => { if (v === null || v === undefined || v === '') return null; const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const round1 = (n) => Math.round(n * 10) / 10;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
let today = keyOf(new Date());

function readJSON(k) {
  let raw;
  try { raw = localStorage.getItem(k); } catch (e) { return { ok: false }; }
  if (!raw) return { ok: true, v: null };
  try { return { ok: true, v: JSON.parse(raw) }; } catch (e) { return { ok: false }; }
}
function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('Couldn\'t save. Storage may be full or blocked.'); return false; } }

/* ---------- The Floor (floor/app.js, key the-floor-v1) ---------- */
const FLOOR_KEY = 'the-floor-v1';
const FLOOR_ITEMS = ['light', 'walk', 'meal', 'brick', 'girls', 'lights'];
const floorMeta = () => ({ steps: 15000, bed: '23:00', oneProject: '', contacts: [], parked: [], name: '', brickWhat: '' });
const blankDay = () => ({ checks: {}, steps: '', brick: '', mood: 0, pain: 0, sleep: '', did: '' });
// Read the whole store and fill in what's missing, keeping every field The Floor wrote (nothing is dropped).
function floorRead() {
  const r = readJSON(FLOOR_KEY);
  if (!r.ok) return null; // unreadable: show it, never overwrite it
  const s = r.v && typeof r.v === 'object' ? r.v : {};
  s.meta = Object.assign(floorMeta(), s.meta && typeof s.meta === 'object' ? s.meta : {});
  if (!Array.isArray(s.meta.contacts)) s.meta.contacts = [];
  if (!s.days || typeof s.days !== 'object') s.days = {};
  return s;
}
function fday(s, k) {
  const d = Object.assign(blankDay(), s.days[k] || {});
  if (!d.checks || typeof d.checks !== 'object') d.checks = {};
  return d;
}
// Read, change, write in one go, so a change made in The Floor a moment ago is never lost.
function floorUpdate(k, fn) {
  const s = floorRead();
  if (!s) { toast('The Floor\'s data can\'t be read, so nothing was changed.'); return false; }
  const d = fday(s, k); fn(d, s); s.days[k] = d;
  return writeJSON(FLOOR_KEY, s);
}
const floorScore = (s, k) => { const d = s.days[k]; return d && d.checks ? FLOOR_ITEMS.filter((i) => d.checks[i]).length : 0; };

/* ---------- Iron & Eggs (gym-fuel/app.js, key gymfuel.v1) ---------- */
const IRON_KEY = 'gymfuel.v1';
// The two Gironda meals exactly as Iron & Eggs logs them from its Gironda bar (data.js STAPLES).
const GIRONDA = [
  { id: 'gironda1', label: 'Meal 1', what: 'Eggs + patties', sub: '6 eggs · 3 pork patties', name: 'Gironda Meal 1: 6 eggs + 3 Lidl pork patties', kcal: 933, p: 77, c: 4, f: 66 },
  { id: 'gironda2', label: 'Meal 2', what: 'Steak + eggs', sub: '6 eggs · 250 g steak', name: 'Gironda Meal 2: 6 eggs + 250 g steak', kcal: 952, p: 93, c: 2.5, f: 61 },
];
// Only an Iron & Eggs that has been opened (and so has its settings and programmes) is written to.
function ironRead() {
  const r = readJSON(IRON_KEY);
  if (!r.ok || !r.v || typeof r.v !== 'object' || !r.v.settings) return null;
  const s = r.v;
  for (const k of ['meals', 'weights', 'workouts']) if (!Array.isArray(s[k])) s[k] = [];
  if (!s.programs || typeof s.programs !== 'object') s.programs = {};
  return s;
}
function ironUpdate(fn) {
  const s = ironRead();
  if (!s) { toast('Open Iron & Eggs once to set it up first.'); return false; }
  fn(s);
  return writeJSON(IRON_KEY, s);
}
const mealsOn = (s, k) => s.meals.filter((m) => m.date === k);
function macrosOn(s, k) {
  const t = { kcal: 0, p: 0 };
  for (const m of mealsOn(s, k)) {
    const n = m.servings == null ? 1 : m.servings;
    t.kcal += (m.kcal == null ? 4 * (m.p || 0) + 4 * (m.c || 0) + 9 * (m.f || 0) : m.kcal) * n;
    t.p += (m.p || 0) * n;
  }
  return t;
}
const slotForTime = (d) => { const h = d.getHours(); return h < 11 ? 'Breakfast' : h < 15 ? 'Lunch' : h < 21 ? 'Dinner' : 'Snack'; };
// Iron & Eggs' activeProgram() and nextDay(), so "next session" here is the one it will offer.
function activeProgram(s) {
  const st = s.settings, act = st.active || {}, fam = st.family || 'cycle';
  const all = Object.values(s.programs);
  const of = (f, tier) => all.filter((p) => p.family === f && (!tier || (p.tier || 'intermediate') === tier));
  if (fam === 'custom') return s.programs[act.custom] || of('custom')[0] || s.programs[act.cycle] || of('cycle')[0] || null;
  const p = s.programs[act[fam]];
  if (p && (fam !== 'hit' || (p.tier || 'intermediate') === (st.tier || 'intermediate'))) return p;
  return (fam === 'hit' ? of(fam, st.tier || 'intermediate')[0] : null) || p || of(fam)[0] || all[0] || null;
}
const sessionsOf = (s, pid) => s.workouts.filter((w) => w.programId === pid).sort((a, b) => String(a.at).localeCompare(String(b.at)));
function nextDay(s, prog) {
  if (!prog || !Array.isArray(prog.days) || !prog.days.length) return null;
  const hist = sessionsOf(s, prog.id), last = hist[hist.length - 1];
  let pool = prog.days;
  if (prog.family === 'cycle' && s.settings.cycleStart) {
    const cw = Math.floor(daysBetween(s.settings.cycleStart, today) / 7) + 1;
    const wk = ((cw - 1) % 4 + 4) % 4 + 1;
    const inWeek = prog.days.filter((d) => d.weeks && d.weeks.includes(wk));
    if (inWeek.length) pool = inWeek;
  }
  if (!last) return pool[0];
  const idx = pool.findIndex((d) => d.id === last.dayId);
  if (idx === -1) {
    const lastNo = prog.days.findIndex((d) => d.id === last.dayId) % Math.max(1, pool.length);
    return lastNo >= 0 ? pool[(lastNo + 1) % pool.length] : pool[0];
  }
  return pool[(idx + 1) % pool.length];
}
function drafted(pid, did) {
  const r = readJSON('gymfuel.drafts');
  const d = r.ok && r.v && r.v[pid + '|' + did];
  return !!(d && Object.keys(d).length);
}

/* ---------- what today looks like ---------- */
function windowNow() { const h = new Date().getHours(); return h < 11 ? 0 : h < 17 ? 1 : 2; }
const WINDOWS = [['Morning', 'Until 11:00'], ['Day', '11:00 to 17:00'], ['Evening', 'From 17:00']];

function snapshot() {
  const F = floorRead(), I = ironRead();
  const fs = F || { meta: floorMeta(), days: {} };
  const d = fday(fs, today);
  const tomorrow = fday(fs, addDays(today, 1));
  const v = { F, I, fs, d, tomorrow, score: floorScore(fs, today) };
  if (I) {
    v.mac = macrosOn(I, today);
    v.goal = { kcal: +I.settings.kcalGoal || 0, p: +I.settings.proteinGoal || 0 };
    v.gironda = I.settings.girondaBar !== false;
    v.meals = GIRONDA.map((g) => mealsOn(I, today).some((m) => m.ref === g.id));
    const ws = I.weights.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    v.weighed = ws.find((w) => w.date === today) || null;
    v.lastWeight = ws.filter((w) => w.date < today).pop() || null;
    v.trained = I.workouts.filter((w) => w.date === today);
    v.week = I.workouts.filter((w) => w.date >= weekStart(today) && w.date <= today).length;
    const prog = activeProgram(I);
    v.prog = prog; v.next = nextDay(I, prog);
    v.inProgress = !!(prog && v.next && drafted(prog.id, v.next.id));
    // HIT programmes say how long to rest; the others aim for four sessions a week.
    const last = prog ? sessionsOf(I, prog.id).pop() : null;
    v.restLeft = prog && prog.restDays && last ? Math.max(0, prog.restDays[0] - daysBetween(last.date, today)) : 0;
    v.trainDue = !v.trained.length && (prog && prog.restDays ? v.restLeft === 0 : v.week < 4);
  }
  return v;
}

// The day in order. Up next is the first thing not done whose time has come.
function tasks(v) {
  const brickWhat = (v.fs.meta.brickWhat || '').trim() || 'money, admin, or the one project';
  const t = [];
  t.push({ id: 'light', w: 0, done: !!v.d.checks.light, t: 'Get up and outside', d: 'Daylight within an hour of waking. It sets the clock for tonight.', act: 'tick' });
  if (v.I) t.push({ id: 'weigh', w: 0, done: !!v.weighed, t: 'Weigh in', d: 'Before food, after the toilet.', act: 'focus', focus: 'kg' });
  t.push({ id: 'brickname', w: 0, done: !!v.d.brick.trim(), t: 'Name today\'s brick', d: 'One concrete action on ' + brickWhat + '.', act: 'focus', focus: 'brickToday' });
  if (v.I && v.gironda) t.push({ id: 'gironda1', w: 0, done: v.meals[0], t: 'Meal 1: eggs + patties', d: '6 eggs and 3 pork patties.', act: 'meal' });
  if (v.I && v.trainDue && v.next) t.push({ id: 'train', w: 1, done: false, t: (v.inProgress ? 'Finish ' : 'Train: ') + v.next.name, d: (v.prog.name || '') + (v.inProgress ? ' · half logged' : ''), act: 'train' });
  if (v.I && v.gironda) t.push({ id: 'gironda2', w: 1, done: v.meals[1], t: 'Meal 2: steak + eggs', d: '6 eggs and 250 g steak.', act: 'meal' });
  if (!(v.I && v.gironda)) t.push({ id: 'meal', w: 1, done: !!v.d.checks.meal, t: 'One proper meal', d: 'Protein first. Steak and eggs counts.', act: 'tick' });
  t.push({ id: 'walk', w: 1, done: !!v.d.checks.walk, t: 'Walk', d: 'Any walk counts. Log the steps.', act: 'focus', focus: 'steps' });
  t.push({ id: 'brick', w: 1, done: !!v.d.checks.brick, t: v.d.brick.trim() ? 'Lay the brick: ' + v.d.brick.trim() : 'Lay one brick', d: 'One concrete action on ' + brickWhat + '.', act: 'tick' });
  t.push({ id: 'girls', w: 1, done: !!v.d.checks.girls, t: 'Something for the girls', d: 'A message, a plan for next visit, something to teach them.', act: 'tick' });
  t.push({ id: 'lights', w: 2, done: !!v.d.checks.lights, t: 'Screens off by ' + v.fs.meta.bed, d: 'Sleep is the variable that moves the rest.', act: 'tick' });
  t.push({ id: 'tonight', w: 2, done: !!v.d.mood, t: 'Two-minute check-in', d: 'Mood, pain, sleep and what you did.', act: 'focus', focus: 'evening' });
  t.push({ id: 'tomorrow', w: 2, done: !!v.tomorrow.brick.trim(), t: 'Set tomorrow\'s brick', d: 'Decide it now, while you know.', act: 'focus', focus: 'brickTomorrow' });
  return t;
}

/* ---------- render ---------- */
function tickBtn(id, on, label) { return '<button type="button" class="tick" data-act="tick" data-id="' + id + '" aria-pressed="' + !!on + '" aria-label="' + esc(label) + '">' + TICK + '</button>'; }
function item(id, on, title, desc, extra) {
  return '<div class="item" id="item-' + id + '">' + tickBtn(id, on, title) + '<div class="body"><div class="t">' + esc(title) + '</div>' + (desc ? '<div class="d">' + esc(desc) + '</div>' : '') + (extra || '') + '</div></div>';
}
function scale(field, val) {
  let h = '<div class="scale" role="group" aria-label="' + field + '">';
  for (let n = 1; n <= 5; n++) h += '<button type="button" data-act="scale" data-field="' + field + '" data-n="' + n + '" aria-pressed="' + (val === n) + '" aria-label="' + field + ' ' + n + '">' + n + '</button>';
  return h + '</div>';
}
function stepsBits(v) {
  const n = +v.d.steps || 0, goal = +v.fs.meta.steps || 15000;
  return { w: Math.min(100, n / goal * 100), label: n.toLocaleString('en-GB') + ' of ' + goal.toLocaleString('en-GB') };
}

function recovery(v) {
  const days = v.fs.days;
  if (!Object.keys(days).some((k) => k < today)) return '<div class="banner"><b>Day one.</b> Work down the page. Four of The Floor\'s six make the day count, and when a day slips the next one is just the floor. Never miss twice.</div>';
  const y = addDays(today, -1);
  if (floorScore(v.fs, y) >= 4) return '';
  return floorScore(v.fs, addDays(today, -2)) < 4
    ? '<div class="banner"><b>Two days down.</b> Don\'t plan a comeback. Tick one box in the next ten minutes. Up and outside is the easiest.</div>'
    : '<div class="banner"><b>Yesterday slipped.</b> That\'s fine. Today is just the floor. Never miss twice.</div>';
}

function scoreCard(v) {
  let strip = '', counted = 0;
  const trainedOn = new Set(v.I ? v.I.workouts.map((w) => w.date) : []);
  for (let i = 13; i >= 0; i--) {
    const k = addDays(today, -i), s = floorScore(v.fs, k);
    const cls = [s >= 4 ? 'ok' : s > 0 ? 'part' : '', k === today ? 'today' : '', trainedOn.has(k) ? 'trained' : ''].filter(Boolean).join(' ');
    if (s >= 4) counted++;
    strip += '<span class="' + cls + '" title="' + esc(fmt(k)) + ': ' + s + '/6' + (trainedOn.has(k) ? ', trained' : '') + '"></span>';
  }
  const s = v.score;
  const word = s >= 6 ? 'Full set' : s >= 4 ? 'Day counts' : (4 - s) + ' more and the day counts';
  let stats = '';
  if (v.I) {
    const kl = Math.round(v.goal.kcal - v.mac.kcal), pl = Math.round(v.goal.p - v.mac.p);
    stats = '<div class="stats">' +
      '<div><div class="label">Protein</div><b class="mono">' + Math.round(v.mac.p) + '</b><span class="mono"> / ' + v.goal.p + ' g</span><div class="bar"><i style="width:' + Math.min(100, v.goal.p ? v.mac.p / v.goal.p * 100 : 0) + '%"></i></div></div>' +
      '<div><div class="label">' + (kl >= 0 ? 'Kcal left' : 'Kcal over') + '</div><b class="mono">' + Math.abs(kl).toLocaleString('en-GB') + '</b><div class="bar"><i class="' + (kl < 0 ? 'over' : '') + '" style="width:' + Math.min(100, v.goal.kcal ? v.mac.kcal / v.goal.kcal * 100 : 0) + '%"></i></div></div>' +
      '<div><div class="label">Gym this week</div><b class="mono">' + v.week + '</b><span class="mono"> / 4</span></div>' +
      '</div>' + (pl > 0 && windowNow() === 2 ? '<div class="label warn">' + pl + ' g protein still to eat today</div>' : '');
  }
  return '<div class="card"><div class="score"><div><span class="big mono" id="scoreNum">' + s + '</span><span class="mono"> / 6</span></div><div class="label" id="scoreWord">' + word + '</div></div>' +
    '<div class="strip" aria-label="Last 14 days">' + strip + '</div><div class="label">' + counted + ' of the last 14 days counted. Aim for 10. A bar under a day: trained.</div>' + stats + '</div>';
}

function upNext(v, list) {
  const cw = windowNow();
  let t = list.find((x) => !x.done && x.w <= cw), later = false;
  if (!t) { t = list.find((x) => !x.done); later = true; }
  if (!t) return '<div class="card next done" id="upNext"><div class="label">Up next</div><h2>That\'s the day</h2><p class="d">Everything on the list is done. Screens off and sleep.</p></div>';
  const left = list.filter((x) => !x.done && x.w <= cw).length;
  let btn;
  if (t.act === 'tick') btn = '<button class="btn" type="button" data-act="tick" data-id="' + t.id + '">Done</button>';
  else if (t.act === 'meal') btn = '<button class="btn" type="button" data-act="meal" data-id="' + t.id + '">Log it</button>';
  else if (t.act === 'train') btn = '<a class="btn" href="../gym-fuel/" data-act="open-iron" data-tab="train">Open Iron &amp; Eggs</a>';
  else btn = '<button class="btn" type="button" data-act="focus" data-id="' + t.focus + '">Go</button>';
  return '<div class="card next" id="upNext"><div class="label">' + (later ? 'Later today' : 'Up next' + (left > 1 ? ' · ' + (left - 1) + ' more after this' : '')) + '</div>' +
    '<h2 id="upNextTitle">' + esc(t.t) + '</h2><p class="d">' + esc(t.d) + '</p><div class="row">' + btn + '</div></div>';
}

function mealBtn(v, i) {
  const g = GIRONDA[i], on = v.meals[i];
  return '<button type="button" class="gbtn" data-act="meal" data-id="' + g.id + '" aria-pressed="' + on + '"><b>' + (on ? '✓ ' : '') + g.label + ' · ' + g.what + '</b><span class="d">' + g.sub + '</span><span class="d mono">' + g.kcal + ' kcal · ' + g.p + ' g protein</span></button>';
}

function section(i, body) {
  const now = windowNow() === i;
  return '<section class="card win' + (now ? ' now' : '') + '" id="win-' + i + '"><div class="whead"><h2>' + WINDOWS[i][0] + '</h2><span class="label">' + (now ? 'Now · ' : '') + WINDOWS[i][1] + '</span></div>' + body + '</section>';
}

function morning(v) {
  let h = '<div class="items">';
  h += item('light', v.d.checks.light, 'Up and outside', 'Daylight within an hour of waking.');
  h += '</div>';
  if (v.I) {
    const lw = v.lastWeight;
    h += '<div class="field"><div class="label">Weigh-in</div><div class="row tight"><input type="number" id="kg" step="0.1" min="30" max="300" inputmode="decimal" placeholder="kg" value="' + (v.weighed ? v.weighed.kg : '') + '">' +
      '<button class="btn' + (v.weighed ? ' ghost' : '') + '" type="button" data-act="weigh">' + (v.weighed ? 'Update' : 'Save') + '</button></div>' +
      '<div class="d">' + (v.weighed ? '✓ Logged today' + (lw ? ' · ' + (v.weighed.kg - lw.kg > 0 ? '+' : '') + round1(v.weighed.kg - lw.kg) + ' kg since ' + esc(fmt(lw.date)) : '') : lw ? 'Last: ' + lw.kg + ' kg on ' + esc(fmt(lw.date)) : 'Goes into Iron & Eggs → Body → Weight.') + '</div></div>';
  }
  h += '<label class="field"><span class="label">Today\'s brick</span><input type="text" id="brickToday" placeholder="One concrete action. Name it." value="' + esc(v.d.brick) + '"></label>';
  if (v.I && v.gironda) h += mealBtn(v, 0);
  return section(0, h);
}

function midday(v) {
  let h = '';
  if (v.I) {
    let tr;
    if (v.trained.length) tr = '<div class="t">✓ Trained: ' + esc(v.trained.map((w) => w.dayName).join(', ')) + '</div><div class="d">' + v.week + ' of 4 sessions this week.</div>';
    else if (!v.next) tr = '<div class="t">No programme yet</div><div class="d">Pick one in Iron & Eggs → Train.</div>';
    else tr = '<div class="t">' + (v.inProgress ? 'Half logged: ' : 'Next: ') + esc(v.next.name) + '</div><div class="d">' + esc(v.prog.name || '') +
      (v.restLeft ? ' · rest ' + v.restLeft + ' more day' + (v.restLeft === 1 ? '' : 's') : v.trainDue ? '' : ' · 4 done this week, a bonus if you go') + '</div>';
    h += '<div class="train"><div class="body">' + tr + '</div><a class="btn' + (v.trained.length || !v.trainDue ? ' ghost' : '') + '" href="../gym-fuel/" data-act="open-iron" data-tab="train">' + (v.trained.length ? 'History' : v.inProgress ? 'Carry on' : 'Start') + '</a></div>';
  }
  if (v.I && v.gironda) h += mealBtn(v, 1);
  const st = stepsBits(v);
  const brick = v.d.brick.trim();
  h += '<div class="items">';
  h += item('meal', v.d.checks.meal, 'One proper meal', v.I && v.gironda ? 'Ticks itself when you log a Gironda meal.' : 'Protein first. Steak and eggs counts.');
  h += item('walk', v.d.checks.walk, 'Walk', 'Any walk counts. Log the steps.',
    '<input type="number" id="steps" min="0" step="100" inputmode="numeric" placeholder="Steps today" value="' + esc(v.d.steps) + '"><div class="bar"><i id="stepsBar" style="width:' + st.w + '%"></i></div><div class="label" id="stepsLabel">' + st.label + '</div>');
  h += item('brick', v.d.checks.brick, 'One brick', brick ? brick : 'Name it in the morning section.');
  h += item('girls', v.d.checks.girls, 'Something for the girls', 'A message, a plan for next visit, something to teach them.', '<div class="d"><span class="label">Next with the girls</span> <b id="nextGirls">' + esc(nextGirls(v.fs)) + '</b> · <a href="../floor/" data-act="open-floor" data-tab="girls">Girls log</a></div>');
  h += '</div>';
  return section(1, h);
}

function nextGirls(fs) {
  const fut = fs.meta.contacts.filter((e) => e && e.type === 'planned' && e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!fut) return 'Nothing booked';
  const n = daysBetween(today, fut.date);
  return fmt(fut.date, { weekday: 'long', day: 'numeric', month: 'short' }) + ' · ' + (n === 0 ? 'today' : n === 1 ? 'tomorrow' : 'in ' + n + ' days');
}

function evening(v) {
  let h = '<div class="items">' + item('lights', v.d.checks.lights, 'Screens off on time', 'By ' + v.fs.meta.bed + '. Sleep is the variable that moves the rest.') + '</div>';
  h += '<div id="evening"><div class="label">Mood</div>' + scale('mood', v.d.mood) + '</div>';
  h += '<div><div class="label">Pain</div>' + scale('pain', v.d.pain) + '</div>';
  if (v.d.mood && v.d.mood <= 2) h += '<div class="support" id="support"><div><b>Rough day.</b> You don\'t have to sit with it alone. These are free, any time:</div><div>Samaritans <a href="tel:116123">116 123</a></div><div>Breathing Space (Scotland) <a href="tel:08008385587">0800 83 85 87</a></div><div>NHS 24 <a href="tel:111">111</a></div></div>';
  h += '<div class="row"><label><span class="label">Slept last night (hrs)</span><input type="number" id="sleep" min="0" max="16" step="0.5" inputmode="decimal" value="' + esc(v.d.sleep) + '"></label>' +
    '<label><span class="label">Tomorrow\'s brick</span><input type="text" id="brickTomorrow" placeholder="Set it now, while you know" value="' + esc(v.tomorrow.brick) + '"></label></div>';
  h += '<label class="field"><span class="label">Today I did</span><textarea id="did" placeholder="Anything beyond the list. Write it down so it exists.">' + esc(v.d.did) + '</textarea></label>';
  return section(2, h);
}

function weekCard(v) {
  const from = weekStart(today);
  let cells = '', counted = 0;
  for (let i = 0; i < 7; i++) {
    const k = addDays(from, i), s = floorScore(v.fs, k), fut = k > today;
    if (s >= 4) counted++;
    const tr = v.I && v.I.workouts.some((w) => w.date === k);
    const p = v.I && !fut ? Math.round(macrosOn(v.I, k).p) : null;
    cells += '<div class="wd' + (k === today ? ' today' : '') + (fut ? ' fut' : '') + '"><span class="label">' + fmt(k, { weekday: 'narrow' }) + '</span>' +
      '<b class="mono ' + (s >= 4 ? 'ok' : s > 0 ? 'part' : '') + '">' + (fut ? '·' : s) + '</b>' +
      (v.I ? '<span class="mono small">' + (tr ? 'GYM' : '&nbsp;') + '</span><span class="mono small">' + (p ? p + 'g' : '&nbsp;') + '</span>' : '') + '</div>';
  }
  return '<div class="card"><div class="whead"><h2>This week</h2><span class="label">' + counted + ' day' + (counted === 1 ? '' : 's') + ' counted' + (v.I ? ' · ' + v.week + '/4 sessions' : '') + '</span></div><div class="week">' + cells + '</div>' +
    (v.I ? '<div class="label">Floor score, gym, protein eaten</div>' : '') + '</div>';
}

function render() {
  const ae = document.activeElement;
  const keep = ae && ae.id && /^(INPUT|TEXTAREA)$/.test(ae.tagName) ? ae.id : null;
  const v = snapshot();
  $('dow').textContent = parseKey(today).toLocaleDateString('en-GB', { weekday: 'long' });
  $('date').textContent = parseKey(today).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  let h = '';
  if (!v.F) h += '<div class="banner"><b>The Floor\'s data can\'t be read.</b> Open The Floor and save a backup; nothing here will change it.</div>';
  h += recovery(v);
  h += upNext(v, tasks(v));
  h += scoreCard(v);
  if (!v.I) h += '<div class="banner" id="ironSetup"><b>Iron &amp; Eggs isn\'t set up on this phone.</b> <a href="../gym-fuel/">Open it once</a> and set your targets; weigh-ins, the Gironda meals, protein and your next session then show here.</div>';
  h += morning(v) + midday(v) + evening(v) + weekCard(v);
  $('app').innerHTML = h;
  if (keep && $(keep)) { const el = $(keep); el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* number inputs */ } }
}

/* ---------- actions ---------- */
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('on'), 1800); }

function tick(id) {
  let on = false, counts = false;
  const ok = floorUpdate(today, (d) => { on = d.checks[id] = !d.checks[id]; counts = FLOOR_ITEMS.filter((i) => d.checks[i]).length === 4; });
  if (!ok) return;
  render();
  if (on && counts) toast('Day counts.');
}

function toggleMeal(id) {
  const g = GIRONDA.find((x) => x.id === id);
  let added = false;
  const ok = ironUpdate((s) => {
    const mine = s.meals.filter((m) => m.date === today && m.ref === id);
    if (mine.length) { const gone = mine[mine.length - 1]; s.meals = s.meals.filter((m) => m !== gone); return; }
    const now = new Date();
    s.meals.push({ id: uid(), date: today, at: now.toISOString(), name: g.name, kcal: g.kcal, p: g.p, c: g.c, f: g.f, servings: 1, ref: g.id, kind: 'staple', slot: slotForTime(now) });
    added = true;
  });
  if (!ok) return;
  // A Gironda meal is a proper meal: tick The Floor's box (taking the meal off leaves the tick alone).
  let counts = false;
  if (added) floorUpdate(today, (d) => { if (!d.checks.meal) { d.checks.meal = true; counts = FLOOR_ITEMS.filter((i) => d.checks[i]).length === 4; } });
  render();
  toast(added ? (counts ? 'Logged ' + g.label + '. Day counts.' : 'Logged ' + g.label) : g.label + ' taken off');
}

function weigh() {
  const kg = num($('kg').value);
  if (kg == null || kg < 30 || kg > 300) { toast('Enter your weight in kg.'); return; }
  const ok = ironUpdate((s) => { s.weights = s.weights.filter((w) => w.date !== today); s.weights.push({ date: today, kg: round1(kg) }); });
  if (!ok) return;
  $('kg').blur(); render(); toast('Weight saved');
}

function focusOn(id) {
  const el = $(id); if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const inp = el.matches('input,textarea') ? el : el.querySelector('input,textarea,button');
  if (inp) setTimeout(() => inp.focus({ preventScroll: true }), 250);
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act;
  if (act === 'tick') tick(el.dataset.id);
  else if (act === 'meal') toggleMeal(el.dataset.id);
  else if (act === 'weigh') weigh();
  else if (act === 'focus') focusOn(el.dataset.id);
  else if (act === 'scale') {
    const f = el.dataset.field, n = +el.dataset.n;
    if (floorUpdate(today, (d) => { d[f] = d[f] === n ? 0 : n; })) render();
  }
  // Open the other app on the right tab: Iron & Eggs restores its tab from sessionStorage, The Floor from localStorage.
  else if (act === 'open-iron') { try { sessionStorage.setItem('gymfuel.ui', JSON.stringify({ tab: el.dataset.tab, sub: {} })); } catch (err) { /* opens on Today */ } }
  else if (act === 'open-floor') { try { localStorage.setItem('the-floor-tab', el.dataset.tab); } catch (err) { /* opens on its last tab */ } }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'kg') weigh(); });

// Text goes straight into The Floor as you type; the page isn't redrawn, so the keyboard stays up.
document.addEventListener('input', (e) => {
  const id = e.target.id, val = e.target.value;
  if (id === 'steps') {
    floorUpdate(today, (d) => { d.steps = val; if ((+val || 0) > 0) d.checks.walk = true; });
    const v = snapshot(), st = stepsBits(v);
    $('stepsBar').style.width = st.w + '%'; $('stepsLabel').textContent = st.label;
    const t = document.querySelector('#item-walk .tick'); if (t) t.setAttribute('aria-pressed', String(!!v.d.checks.walk));
    $('scoreNum').textContent = v.score;
  } else if (id === 'brickToday') floorUpdate(today, (d) => { d.brick = val; });
  else if (id === 'brickTomorrow') floorUpdate(addDays(today, 1), (d) => { d.brick = val; });
  else if (id === 'sleep') floorUpdate(today, (d) => { d.sleep = val; });
  else if (id === 'did') floorUpdate(today, (d) => { d.did = val; });
});
// Once the typing's done, bring Up next and the rest of the page up to date. Not while moving from one box
// to the next (that would redraw the box being typed in), and not before a tap that ended the typing lands.
let pointerDown = false, pending = false;
const typing = () => { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA)$/.test(a.tagName); };
function settle() {
  if (!pending || pointerDown) return;
  setTimeout(() => { if (pending && !pointerDown && !typing()) { pending = false; render(); } }, 0);
}
document.addEventListener('pointerdown', () => { pointerDown = true; }, true);
['pointerup', 'pointercancel'].forEach((t) => document.addEventListener(t, () => { pointerDown = false; settle(); }, true));
document.addEventListener('focusout', settle);
document.addEventListener('change', (e) => { if (['steps', 'brickToday', 'brickTomorrow', 'sleep', 'did'].includes(e.target.id)) { pending = true; settle(); } });

// Coming back after using the other apps, or past midnight: show what's there now.
function refresh() {
  today = keyOf(new Date());
  if (typing()) { pending = true; return; }
  render();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
window.addEventListener('storage', (e) => { if (e.key === FLOOR_KEY || e.key === IRON_KEY) refresh(); });
setInterval(() => { if (keyOf(new Date()) !== today || windowNow() !== render.win) { render.win = windowNow(); refresh(); } }, 60000);
render.win = windowNow();

render();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
window.__daily = { snapshot, tasks, render };
})();
