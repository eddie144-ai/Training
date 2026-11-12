'use strict';
/* Cut tools for Iron & Eggs: milestone maths, the Monday–Sunday report, strength PRs,
   injury-safe swaps, yesterday's catch-up, and progress-photo metadata.
   No network and no storage. The page decides what to save. */
const Cut = (() => {
  const START_KG = 104.8;
  const START_DATE = '2026-11-01';
  const BADGES = [100, 95, 90, 85, 80, 75];
  const SESSIONS = 4;
  const PHYSIO = 'This is not medical advice. Follow your physio plan.';

  const iso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  function parse(s) {
    const [y, m, d] = String(s).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }
  function fmt(ms) {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  }
  const addDays = (s, n) => fmt(parse(s) + n * 86400000);
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const dow = (s) => new Date(parse(s)).getUTCDay();
  const weekMonday = (s) => addDays(s, -((dow(s) + 6) % 7));
  const round1 = (n) => Math.round(n * 10) / 10;

  function exKey(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean)
      .map((w) => (w.endsWith('sses') ? w.slice(0, -2) : w.endsWith('s') && !w.endsWith('ss') && w.length > 3 ? w.slice(0, -1) : w)).join(' ');
  }

  function startKg(settings) {
    const n = Number(settings?.startWeight);
    return Number.isFinite(n) && n > 0 ? round1(n) : START_KG;
  }
  function startDate(settings) {
    return iso(settings?.cutStart) ? settings.cutStart : START_DATE;
  }
  function targetKg(settings) {
    const n = Number(settings?.target);
    return Number.isFinite(n) && n > 0 ? round1(n) : 75;
  }

  function milestones(weights, settings) {
    const start = startKg(settings);
    const target = targetKg(settings);
    const list = (weights || []).filter((w) => w && iso(w.date) && Number.isFinite(Number(w.kg)))
      .map((w) => ({ date: w.date, kg: round1(Number(w.kg)) }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const latest = list.length ? list[list.length - 1] : null;
    const now = latest ? latest.kg : null;
    const span = start - target;
    const pct = now == null || !span ? 0 : Math.max(0, Math.min(1, (start - now) / span));
    const earned = BADGES.filter((kg) => list.some((w) => w.kg <= kg));
    return {
      start,
      startDate: startDate(settings),
      target,
      latest,
      lost: now == null ? null : round1(start - now),
      toGo: now == null ? null : round1(Math.max(0, now - target)),
      pct,
      badges: BADGES.map((kg) => ({ kg, earned: earned.includes(kg) })),
      earned,
    };
  }

  function newBadges(earned, seen) {
    const have = new Set(seen || []);
    return (earned || []).filter((kg) => !have.has(kg));
  }

  function cutDay(date, start) {
    if (!iso(date) || !iso(start) || date < start) return 0;
    return daysBetween(start, date) + 1;
  }

  function weightOn(weights, date) {
    const rows = (weights || []).filter((w) => w && iso(w.date) && w.date <= date && Number.isFinite(Number(w.kg)))
      .sort((a, b) => a.date.localeCompare(b.date));
    return rows.length ? round1(Number(rows[rows.length - 1].kg)) : null;
  }

  function weeksFor(today, earliest) {
    if (!iso(today)) return [];
    const out = [];
    const thisMon = weekMonday(today);
    if (dow(today) === 0) out.push({ monday: thisMon, sunday: today, current: true });
    let monday = addDays(thisMon, -7);
    const stop = iso(earliest) ? earliest : addDays(thisMon, -7 * 16);
    while (monday >= addDays(stop, -6) && out.length < 16) {
      out.push({ monday, sunday: addDays(monday, 6), current: false });
      monday = addDays(monday, -7);
    }
    return out;
  }

  function mealBits(m) {
    const k = m.servings == null ? 1 : Number(m.servings) || 0;
    const p = (Number(m.p) || 0) * k;
    const c = (Number(m.c) || 0) * k;
    const f = (Number(m.f) || 0) * k;
    const kcal = (m.kcal == null ? 4 * (Number(m.p) || 0) + 4 * (Number(m.c) || 0) + 9 * (Number(m.f) || 0) : Number(m.kcal) || 0) * k;
    return { p, c, kcal };
  }

  function weeklyReport(state, monday) {
    const sunday = addDays(monday, 6);
    const prevMon = addDays(monday, -7);
    const prevSun = addDays(monday, -1);
    const inWeek = (date) => date >= monday && date <= sunday;
    const avgOf = (rows) => (rows.length ? round1(rows.reduce((a, w) => a + Number(w.kg), 0) / rows.length) : null);
    const weights = (state.weights || []).filter((w) => w && Number.isFinite(Number(w.kg)));
    const avgWeight = avgOf(weights.filter((w) => inWeek(w.date)));
    const prevAvg = avgOf(weights.filter((w) => w.date >= prevMon && w.date <= prevSun));
    const sessions = (state.workouts || []).filter((w) => w && inWeek(w.date));
    const sessionSec = sessions.reduce((a, w) => a + (Number(w.sec) || 0), 0);
    const goal = Number(state.settings?.proteinGoal) > 0 ? Number(state.settings.proteinGoal) : 170;
    const byDay = {};
    for (const m of state.meals || []) {
      if (!m || !inWeek(m.date)) continue;
      const b = mealBits(m);
      const day = byDay[m.date] || (byDay[m.date] = { p: 0, c: 0, kcal: 0 });
      day.p += b.p; day.c += b.c; day.kcal += b.kcal;
    }
    const days = Object.values(byDay);
    const proteinDays = days.filter((d) => d.p + 1e-6 >= goal).length;
    const chains = (state.chains || []).filter((c) => c && c.name).map((c) => ({
      name: String(c.name),
      day: !iso(c.since) || c.since > sunday ? 0 : daysBetween(c.since, sunday) + 1,
    }));
    return {
      monday,
      sunday,
      avgWeight,
      prevAvg,
      weightChange: avgWeight == null || prevAvg == null ? null : round1(avgWeight - prevAvg),
      sessions: sessions.length,
      sessionTarget: SESSIONS,
      sessionSec,
      proteinDays,
      proteinGoal: goal,
      loggedDays: days.length,
      avgKcal: days.length ? Math.round(days.reduce((a, d) => a + d.kcal, 0) / days.length) : null,
      avgCarbs: days.length ? round1(days.reduce((a, d) => a + d.c, 0) / days.length) : null,
      chains,
    };
  }

  function fmtDuration(sec) {
    const s = Math.max(0, Math.round(Number(sec) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (!s) return '0 min';
    if (h) return `${h} h ${m} min`;
    return `${m} min`;
  }

  function priorSets(workouts, name) {
    const key = exKey(name);
    const sets = [];
    for (const w of workouts || []) {
      for (const e of w?.entries || []) {
        if (exKey(e?.name) !== key) continue;
        for (const s of e.sets || []) if (s && s.kg > 0 && s.reps > 0) sets.push({ kg: Number(s.kg), reps: Number(s.reps) });
      }
    }
    return sets;
  }

  // Flags only when a previous set exists. weight = heavier; reps = more reps at that same weight; e1rm = Epley.
  function prFlags(set, prior) {
    const hist = (prior || []).filter((s) => s && s.kg > 0 && s.reps > 0);
    const kg = Number(set?.kg);
    const reps = Number(set?.reps);
    if (!hist.length || !(kg > 0) || !(reps > 0)) return [];
    const flags = [];
    const topKg = Math.max(...hist.map((s) => s.kg));
    if (kg > topKg + 0.001) flags.push('weight');
    const same = hist.filter((s) => Math.abs(s.kg - kg) < 0.05);
    const bestReps = same.reduce((m, s) => Math.max(m, s.reps), 0);
    if (bestReps && reps > bestReps) flags.push('reps');
    const e1 = kg * (1 + reps / 30);
    const bestE = Math.max(...hist.map((s) => s.kg * (1 + s.reps / 30)));
    if (e1 > bestE + 0.05) flags.push('e1rm');
    return flags;
  }

  function personalRecords(workouts) {
    const by = {};
    for (const w of workouts || []) {
      for (const e of w?.entries || []) {
        if (!e?.name) continue;
        const key = exKey(e.name);
        for (const s of e.sets || []) {
          if (!(s?.kg > 0) || !(s?.reps > 0)) continue;
          const rec = by[key] || (by[key] = { name: e.name, bestKg: 0, bestKgReps: 0, bestKgDate: '', bestE1: 0, bestE1Kg: 0, bestE1Reps: 0, bestE1Date: '' });
          if (s.kg > rec.bestKg + 0.001 || (Math.abs(s.kg - rec.bestKg) < 0.05 && s.reps > rec.bestKgReps)) {
            rec.bestKg = Number(s.kg); rec.bestKgReps = Number(s.reps); rec.bestKgDate = w.date || ''; rec.name = e.name;
          }
          const e1 = s.kg * (1 + s.reps / 30);
          if (e1 > rec.bestE1 + 0.001) {
            rec.bestE1 = e1; rec.bestE1Kg = Number(s.kg); rec.bestE1Reps = Number(s.reps); rec.bestE1Date = w.date || ''; rec.name = e.name;
          }
        }
      }
    }
    return Object.values(by).sort((a, b) => a.name.localeCompare(b.name));
  }

  const RULES = [
    { area: 'Lower back', keys: ['barbell deadlift', 'deadlift'], skip: ['romanian'],
      options: [
        { name: 'Chest-supported row', why: 'Your chest takes the load, so the lower back is not holding a conventional deadlift.' },
        { name: 'Seated machine row', why: 'The pad supports you. Skip conventional deadlifts and good mornings.' },
      ] },
    { area: 'Lower back', keys: ['good morning'],
      options: [
        { name: 'Hip thrust', why: 'The hips work on a bench. A good morning loads the lower back.' },
      ] },
    { area: 'Lower back', keys: ['bent over row', 'barbell row'],
      options: [
        { name: 'Chest-supported dumbbell row', why: 'The chest is supported, instead of hinging under the bar.' },
        { name: 'Seated machine row', why: 'A machine row keeps the lower back out of the lift.' },
      ] },
    { area: 'Left hip and knees', keys: ['romanian deadlift'],
      options: [
        { name: 'Hip thrust', why: 'The hips do the work on a bench, with less hinge in the lower back and no deep knee bend.' },
        { name: 'Leg press, short range', why: 'Stop short of a deep bend so the left hip and knee do less.' },
      ] },
    { area: 'Left hip and knees', keys: ['barbell squat', 'squat'], skip: ['box'],
      options: [
        { name: 'Box squat', why: 'You sit to a box, so the squat stops before a deep bend on the left hip and knee.' },
      ] },
    { area: 'Left hip and knees', keys: ['leg press'], skip: ['short'],
      options: [
        { name: 'Leg press, short range', why: 'Use a short range and stop before the knees travel deep. Kinder on the left hip and knee.' },
      ] },
    { area: 'Left hip and knees', keys: ['lunge', 'bulgarian'],
      options: [
        { name: 'Box squat', why: 'A box squat replaces a deep lunge, which loads the left hip and knee.' },
        { name: 'Leg extension, light', why: 'A light leg extension works the quads without a deep bend.' },
      ] },
    { area: 'Left biceps', keys: ['zottman curl', 'spider curl', 'preacher', 'drag curl', 'bicep pulldown', 'wall curl', 'barbell curl', 'chin'],
      options: [
        { name: 'Hammer curl', why: 'A neutral grip, instead of a heavy supinated curl or a chin-up, is kinder on the left biceps.' },
        { name: 'Cable hammer curl', why: 'The cable keeps the wrist neutral and the load steady, without a supinated curl.' },
      ] },
  ];

  function swapsFor(name) {
    const key = exKey(name);
    if (!key || key.includes('hammer')) return [];
    if (key.includes('tricep')) return [];
    const out = [];
    for (const rule of RULES) {
      if ((rule.skip || []).some((s) => key.includes(s))) continue;
      const hit = rule.keys.some((k) => key === k || key.includes(k));
      if (!hit) continue;
      if (rule.keys.includes('deadlift') && key.includes('romanian')) continue;
      for (const o of rule.options) out.push({ name: o.name, why: o.why, area: rule.area });
    }
    return out;
  }

  function catchUp(date, weights, meals) {
    const needWeight = !(weights || []).some((w) => w && w.date === date);
    const needFood = !(meals || []).some((m) => m && m.date === date);
    return { date, needWeight, needFood, show: needWeight || needFood };
  }

  function cleanPhoto(x) {
    if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !x.id) return null;
    if (!['front', 'side', 'back'].includes(x.pose) || !iso(x.date)) return null;
    const at = new Date(x.at);
    return {
      id: x.id.slice(0, 80),
      date: x.date,
      pose: x.pose,
      at: Number.isNaN(at.getTime()) ? new Date(0).toISOString() : at.toISOString(),
    };
  }
  const cleanPhotos = (list) => (Array.isArray(list) ? list : []).map(cleanPhoto).filter(Boolean);

  return {
    START_KG, START_DATE, BADGES, SESSIONS, PHYSIO,
    exKey, startKg, startDate, targetKg, milestones, newBadges, cutDay, weightOn,
    weeksFor, weeklyReport, fmtDuration, priorSets, prFlags, personalRecords, swapsFor, catchUp,
    cleanPhoto, cleanPhotos, addDays, weekMonday,
  };
})();
