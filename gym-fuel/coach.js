'use strict';
/* A short brief for Coach Mike (a Grok bot) and a parser for the programme he sends back.
   The brief is plain text the share sheet can hand to his chat. His reply is one JSON
   programme, which the app saves under My workouts. No network calls in this file. */
const Coach = (() => {
  const KIND = 'coach-mike-programme';

  function brief(d) {
    const lines = [
      'Coach Mike, this is my Iron & Eggs log. Write me one programme.',
      d.style === 'Mentzer HIT'
        ? 'Follow Mentzer: one work set to positive failure after warm-ups, an isolation move straight into a compound when you superset, and 4–7 days between sessions. Reps 6–10, legs and calves 12–20, presses that follow a superset 3–5.'
        : d.style === '4-week cycle'
          ? 'Follow the 4-week cycle: weeks 1–2 at 6–8 reps, weeks 3–4 at 10–12. Mark those with "weeks": [1, 2] or [3, 4] on each day.'
          : 'Keep the split I already use. Change only what the log below supports.',
      'Use exercises from this log. If a lift hit the top of its rep range, raise the weight next time (about 10% on a Mentzer set, 2.5 kg on a cycle set).',
      '',
      `STYLE: ${d.style}${d.tier ? ` (${d.tier})` : ''}`,
      `PROGRAMME: ${d.programme}`,
      `REST: ${d.rest}`,
      `NEXT DAY: ${d.nextDay}`,
      '',
      'NEXT SESSION',
    ];
    for (const e of d.exercises || []) {
      const last = e.last ? `last ${e.last}${e.lastDate ? ` on ${e.lastDate}` : ''}` : 'no weight logged yet';
      const due = e.due ? ` ${e.due}` : '';
      lines.push(`- ${e.name} | ${e.sets} set${Number(e.sets) === 1 ? '' : 's'} | ${e.reps} | ${last}.${due}`);
    }
    if (!d.exercises?.length) lines.push('- No exercises on this day yet.');
    if (d.otherDays?.length) {
      lines.push('', 'OTHER DAYS');
      for (const day of d.otherDays) lines.push(`- ${day}`);
    }
    const due = (d.exercises || []).filter((e) => e.due);
    if (due.length) {
      lines.push('', 'DUE A HEAVIER WEIGHT');
      for (const e of due) lines.push(`- ${e.name}: ${e.due}`);
    }
    if (d.drive) lines.push('', 'A full backup is in my Google Drive as iron-and-eggs-latest.json.');
    lines.push(
      '',
      'Reply with only one JSON object, no markdown, in this shape:',
      '{"kind":"coach-mike-programme","name":"Name","rest":"4-7","days":[{"name":"Day A","weeks":[1,2],"exercises":[{"name":"Incline Press","sets":1,"reps":"6-10","note":"","ss":false}]}]}',
      'rest is optional, like "4-7" or "1-2". ss true means superset with the next exercise. weeks is optional and only for a 4-week plan.',
    );
    return lines.join('\n');
  }

  function jsonObjects(text) {
    const out = [];
    let inStr = false, esc = false, start = -1, depth = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === '{') { if (depth === 0) start = i; depth += 1; }
      else if (c === '}' && depth) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          try { out.push(JSON.parse(text.slice(start, i + 1))); } catch { /* not this programme */ }
          start = -1;
        }
      }
    }
    return out;
  }

  function restDays(rest) {
    if (Array.isArray(rest) && rest.length === 2) {
      const a = Number(rest[0]), b = Number(rest[1]);
      if (a >= 1 && b >= a && b <= 14) return [a, b];
    }
    const m = String(rest || '').match(/(\d+)\s*[–-]\s*(\d+)/);
    if (!m) return null;
    const a = Number(m[1]), b = Number(m[2]);
    return a >= 1 && b >= a && b <= 14 ? [a, b] : null;
  }

  function weeksOf(weeks) {
    if (!Array.isArray(weeks)) return null;
    const nums = [...new Set(weeks.map(Number).filter((n) => n >= 1 && n <= 4))];
    return nums.length ? nums.sort((a, b) => a - b) : null;
  }

  function clip(s, n) { return String(s || '').trim().slice(0, n); }

  function programme(text) {
    const found = jsonObjects(String(text || '')).filter((o) => o && o.kind === KIND);
    const raw = found[found.length - 1];
    if (!raw) return { ok: false, error: 'That isn\'t a programme from Coach Mike. Ask him to reply with the JSON block.' };
    const name = clip(raw.name, 60);
    const daysIn = Array.isArray(raw.days) ? raw.days.slice(0, 7) : [];
    if (!name || !daysIn.length) return { ok: false, error: 'The programme needs a name and at least one day.' };
    const days = [];
    for (const day of daysIn) {
      const dayName = clip(day?.name, 60);
      const exercises = [];
      for (const e of (Array.isArray(day?.exercises) ? day.exercises : []).slice(0, 12)) {
        const exName = clip(e?.name, 80);
        if (!exName) continue;
        const sets = Math.min(10, Math.max(1, Math.round(Number(e.sets) || 1)));
        exercises.push({
          name: exName, sets, reps: clip(e.reps, 20) || '8–12', note: clip(e.note, 80), ss: !!e.ss, tech: '',
        });
      }
      if (!dayName || !exercises.length) continue;
      const row = { name: dayName, exercises };
      const weeks = weeksOf(day.weeks);
      if (weeks) row.weeks = weeks;
      days.push(row);
    }
    if (!days.length) return { ok: false, error: 'Each day needs a name and at least one exercise.' };
    const prog = {
      family: 'custom', name, edited: true,
      about: 'From Coach Mike.', source: 'Coach Mike', days,
    };
    const rest = restDays(raw.rest);
    if (rest) prog.restDays = rest;
    return { ok: true, programme: prog };
  }

  return { brief, programme };
})();
