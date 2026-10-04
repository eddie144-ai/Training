'use strict';
/* Read-only adapter for Trainer's data. This is the only code in Life RPG that touches Trainer's storage.
   Contract (see STORAGE.md):
   - Reads exactly one key, `trainer.v1`, with getItem. Never calls setItem, removeItem or clear.
   - Never enumerates localStorage.
   - Everything is validated: wrong types are dropped, never coerced. Numbers must be finite and >= 0;
     numeric strings ("12000") are ignored. Dates must be YYYY-MM-DD.
   - Returns a frozen, sanitised copy. Callers can't reach Trainer's original object. */
const TrainerAdapter = (() => {
  const KEY = 'trainer.v1';
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const PLAN_KINDS = new Set(['train', 'rest', 'fast']);
  const MAX_STEPS = 200000;
  const MAX_KG = 1000;
  const MAX_REPS = 500;

  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const arr = (x) => (Array.isArray(x) ? x : []);
  const nonneg = (v, max) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null);
  const bool = (v) => (v === true || v === false ? v : null);
  const dated = (o) => (isObj(o) ? Object.entries(o).filter(([d, v]) => DATE.test(d) && isObj(v)) : []);

  function sanitise(t) {
    const workouts = arr(t.workouts).filter((w) => isObj(w) && typeof w.date === 'string' && DATE.test(w.date)).map((w) => ({
      date: w.date,
      sets: arr(w.entries).flatMap((e) => (isObj(e) ? arr(e.sets) : []))
        .map((s) => (isObj(s) ? { kg: nonneg(s.kg, MAX_KG), reps: nonneg(s.reps, MAX_REPS) } : { kg: null, reps: null }))
        .filter((s) => s.kg != null && s.reps != null),
    }));
    const meals = arr(t.meals).filter((m) => isObj(m) && typeof m.date === 'string' && DATE.test(m.date) && typeof m.ref === 'string')
      .map((m) => ({ date: m.date, ref: m.ref }));
    const days = {};
    for (const [d, v] of dated(t.days)) {
      const ch = isObj(v.chains) ? v.chains : {};
      days[d] = { steps: nonneg(v.steps, MAX_STEPS), cut: bool(ch.cut), coffee: bool(ch.coffee), fast: v.fast === true };
    }
    const garminSteps = {};
    for (const [d, v] of dated(t.garmin)) { const s = nonneg(v.steps, MAX_STEPS); if (s != null) garminSteps[d] = s; }
    const plans = {};
    for (const [d, v] of dated(t.plans)) if (PLAN_KINDS.has(v.kind)) plans[d] = v.kind;
    return Object.freeze({ workouts, meals, days, garminSteps, plans });
  }

  // Returns { ok: true, data } or { ok: false, error: 'off' | 'missing' | 'unavailable' | 'corrupt' | 'shape' }.
  function read(storage) {
    let raw;
    try { raw = storage.getItem(KEY); } catch { return { ok: false, error: 'unavailable' }; }
    if (raw == null) return { ok: false, error: 'missing' };
    let t;
    try { t = JSON.parse(raw); } catch { return { ok: false, error: 'corrupt' }; }
    if (!isObj(t)) return { ok: false, error: 'shape' };
    return { ok: true, data: sanitise(t) };
  }

  return Object.freeze({ KEY, read, sanitise });
})();
