'use strict';
/* Workout clock, rest between sets, and rep tempo. Times are timestamps, so leaving the
   screen and coming back shows the right second. No DOM and no sound in here. */
const Session = (() => {
  const REST_CHOICES = [60, 90, 120, 180];
  const DEFAULT_REST = 90;
  const PHASES = ['Lower', 'Hold', 'Lift', 'Hold'];

  function restLeft(endAt, now) {
    const end = Number(endAt), t = Number(now);
    if (!Number.isFinite(end) || !Number.isFinite(t)) return 0;
    return Math.max(0, Math.ceil((end - t) / 1000));
  }
  function restEndsAt(now, seconds) {
    const sec = REST_CHOICES.includes(Number(seconds)) ? Number(seconds) : DEFAULT_REST;
    return Number(now) + sec * 1000;
  }
  // Beep only as rest hits zero, or within a few seconds of it. Coming back much later stays quiet.
  function shouldRestAlert(endAt, now, alerted) {
    if (alerted) return false;
    const end = Number(endAt), t = Number(now);
    if (!Number.isFinite(end) || !Number.isFinite(t)) return false;
    const late = t - end;
    return late >= 0 && late < 3000;
  }
  function elapsedSec(startedAt, now) {
    const a = Number(startedAt), t = Number(now);
    if (!Number.isFinite(a) || !Number.isFinite(t)) return 0;
    return Math.max(0, Math.floor((t - a) / 1000));
  }
  function formatClock(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    const p = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${p(m)}:${p(r)}` : `${m}:${p(r)}`;
  }
  // 3-1-1-0 is lower, pause, lift, pause. A 0-second phase is skipped. All four numbers are required.
  function parseTempo(str) {
    const parts = String(str ?? '').trim().split(/[^0-9]+/).filter(Boolean).map((x) => Number(x));
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 20)) return null;
    if (parts.every((n) => n === 0)) return null;
    return parts;
  }
  function tempoPhases(tempo) {
    const parts = Array.isArray(tempo) ? tempo : parseTempo(tempo);
    if (!parts || parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0)) return null;
    const phases = [];
    parts.forEach((sec, i) => { if (sec > 0) phases.push({ name: PHASES[i], ms: sec * 1000, i }); });
    return phases.length ? phases : null;
  }
  function tempoAt(tempo, elapsedMs) {
    const phases = tempoPhases(tempo);
    if (!phases) return null;
    const cycle = phases.reduce((t, p) => t + p.ms, 0);
    const elapsed = Math.max(0, Number(elapsedMs) || 0);
    const rep = Math.floor(elapsed / cycle) + 1;
    let t = elapsed % cycle;
    for (const p of phases) {
      if (t < p.ms) return { rep, phase: p.name, left: (p.ms - t) / 1000, index: p.i, cycle: cycle / 1000 };
      t -= p.ms;
    }
    const p = phases[0];
    return { rep, phase: p.name, left: p.ms / 1000, index: p.i, cycle: cycle / 1000 };
  }
  // Changes when the phase or the rep changes, so a tick can fire once per phase.
  function tempoMark(tempo, elapsedMs) {
    const at = tempoAt(tempo, elapsedMs);
    return at ? at.rep * 10 + at.index : -1;
  }
  function setReady(set, mode) {
    if (!set || typeof set !== 'object') return false;
    const has = (k) => String(set[k] ?? '').trim() !== '';
    if (mode === 'singles') return has('kg');
    if (mode === 'hold') return has('kg') && has('hold');
    if (mode === 'failhold') return has('kg') && (has('reps') || has('hold'));
    return has('kg') && has('reps');
  }

  return {
    REST_CHOICES, DEFAULT_REST, PHASES,
    restLeft, restEndsAt, shouldRestAlert, elapsedSec, formatClock,
    parseTempo, tempoAt, tempoMark, setReady,
  };
})();
