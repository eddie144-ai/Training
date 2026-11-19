'use strict';
/* Read a Garmin watch or Garmin Connect screen from on-device text.
   The numbers are whatever the photo actually showed. Missing fields stay empty.
   No network. The page decides what to save. */
const Garmin = (() => {
  const FIELDS = ['steps', 'sleepMin', 'hrv', 'rhr', 'battery', 'stress', 'kcal', 'intensity'];
  const LIMITS = { steps: 200000, sleepMin: 24 * 60, hrv: 300, rhr: 220, battery: 100, stress: 100, kcal: 20000, intensity: 1440 };

  function digits(raw) {
    const s = String(raw || '').replace(/[oO]/g, '0').replace(/,/g, '').replace(/[^\d.]/g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  function bounded(n, max) {
    if (n == null || n < 0 || n > max) return null;
    return Math.round(n);
  }
  function windowAfter(text, word, len) {
    const i = text.search(word);
    return i < 0 ? '' : text.slice(i, i + len);
  }

  function sleepMinutes(text) {
    const w = windowAfter(text, /sleep/, 90) || text;
    let m = w.match(/(\d{1,2})\s*h(?:r|rs|ours?)?(?:\s*(\d{1,2})\s*m(?:in)?)?/);
    if (m && Number(m[1]) <= 16) return bounded(Number(m[1]) * 60 + Number(m[2] || 0), LIMITS.sleepMin);
    m = w.match(/(\d{1,2})\s*:\s*(\d{2})/);
    if (m && Number(m[1]) <= 16 && Number(m[2]) < 60) return bounded(Number(m[1]) * 60 + Number(m[2]), LIMITS.sleepMin);
    return null;
  }

  function firstNumber(chunk, max) {
    const m = chunk.match(/(\d[\d,.]*)/);
    return m ? bounded(digits(m[1]), max) : null;
  }

  function parseGarmin(text) {
    const raw = String(text || '').replace(/\u00a0/g, ' ');
    const t = raw.toLowerCase();
    const out = { steps: null, sleepMin: null, hrv: null, rhr: null, battery: null, stress: null, kcal: null, intensity: null };
    const steps = t.match(/(\d[\d,]*)\s*steps/) || t.match(/steps[^0-9]{0,16}(\d[\d,]*)/);
    if (steps) out.steps = bounded(digits(steps[1]), LIMITS.steps);
    out.sleepMin = sleepMinutes(t);
    const hrv = t.match(/hrv[^0-9]{0,16}(\d{2,3})/) || t.match(/(\d{2,3})\s*ms\b/);
    if (hrv) out.hrv = bounded(digits(hrv[1]), LIMITS.hrv);
    const rhr = t.match(/resting(?:\s+heart\s+rate|\s+hr)?[^0-9]{0,16}(\d{2,3})/) || t.match(/\brhr[^0-9]{0,12}(\d{2,3})/);
    if (rhr) out.rhr = bounded(digits(rhr[1]), LIMITS.rhr);
    const battery = windowAfter(t, /body\s*battery/, 40);
    if (battery) out.battery = firstNumber(battery, LIMITS.battery);
    const stress = windowAfter(t, /stress/, 30);
    if (stress && !/stress/.test(stress.slice(6, 12)) ) out.stress = firstNumber(stress.replace(/^stress/, ''), LIMITS.stress);
    const cal = t.match(/calories[^\d\n]{0,16}(\d[\d,]*)/) || t.match(/(\d[\d,]*)[^\n]{0,8}(?:kcal|cal)\b/);
    if (cal) out.kcal = bounded(digits(cal[1]), LIMITS.kcal);
    const intense = t.match(/intensity(?:\s+minutes?)?[^0-9]{0,16}(\d{1,4})/) || t.match(/(\d{1,4})\s+intensity/);
    if (intense) out.intensity = bounded(digits(intense[1]), LIMITS.intensity);
    out.found = FIELDS.filter((k) => out[k] != null);
    return out;
  }

  function iso(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
  function cleanDay(x) {
    if (!x || typeof x !== 'object' || !iso(x.date)) return null;
    const day = { id: String(x.id || '').slice(0, 40), date: x.date, note: String(x.note || '').slice(0, 200), photoId: typeof x.photoId === 'string' ? x.photoId.slice(0, 80) : '' };
    let any = false;
    for (const k of FIELDS) {
      if (x[k] == null || x[k] === '') day[k] = null;
      else day[k] = bounded(Number(x[k]), LIMITS[k]);
      if (day[k] != null) any = true;
    }
    if (!any && !day.photoId && !day.note) return null;
    const at = new Date(x.at || 0);
    day.at = Number.isNaN(at.getTime()) ? new Date(0).toISOString() : at.toISOString();
    return day;
  }
  function cleanDays(list) {
    const by = new Map();
    for (const row of (Array.isArray(list) ? list : []).map(cleanDay).filter(Boolean)) {
      const prev = by.get(row.date);
      if (!prev || (row.at || '') >= (prev.at || '')) by.set(row.date, row.id ? row : { ...row, id: row.date });
    }
    return [...by.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
  function fmtSleep(min) {
    if (min == null) return '—';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  const REMINDER = 'A website cannot wake the phone at bedtime once the app is closed. If you allow notifications, Iron & Eggs can ping you only while this page is still open. The Today card is the reminder that always works.';

  return { FIELDS, LIMITS, parseGarmin, cleanDay, cleanDays, fmtSleep, REMINDER };
})();
