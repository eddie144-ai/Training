'use strict';
/* Reminders as a calendar file (.ics). An offline web app can't wake your phone on a schedule without a push
   server, so the reliable route is your calendar: import the file once (Google Calendar: Settings → Import)
   and the phone reminds you. Re-download it after changing the carb-up interval or training days. */
const Reminders = (() => {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  const local = (date, hhmm) => `${date.replace(/-/g, '')}T${hhmm.replace(':', '')}00`;
  const escText = (s) => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  // Lines over 75 octets must be folded (RFC 5545).
  const fold = (line) => { const out = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ` ${s.slice(74)}`; } out.push(s); return out.join('\r\n'); };

  function event({ uid, date, time, minutes = 10, title, desc, rrule, alarm = 0 }) {
    const [h, m] = time.split(':').map(Number);
    const end = `${pad(Math.floor((h * 60 + m + minutes) / 60) % 24)}:${pad((h * 60 + m + minutes) % 60)}`;
    return [
      'BEGIN:VEVENT', `UID:${uid}@shredded-system`, `DTSTAMP:${stamp(new Date())}`,
      `DTSTART;TZID=Europe/London:${local(date, time)}`, `DTEND;TZID=Europe/London:${local(date, end)}`,
      `SUMMARY:${escText(title)}`, `DESCRIPTION:${escText(desc)}`, ...(rrule ? [`RRULE:${rrule}`] : []),
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escText(title)}`, `TRIGGER:-PT${alarm}M`, 'END:VALARM', 'END:VEVENT',
    ];
  }
  // opts: { from, weighTime, carbupDates: [date], trainDays: [0-6], trainTime }
  function build(opts) {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Shredded System//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Shredded System',
      'BEGIN:VTIMEZONE', 'TZID:Europe/London',
      'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0000', 'TZOFFSETTO:+0100', 'TZNAME:BST', 'DTSTART:19700329T010000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
      'BEGIN:STANDARD', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0000', 'TZNAME:GMT', 'DTSTART:19701025T020000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
      'END:VTIMEZONE'];
    lines.push(...event({ uid: 'weigh-in', date: opts.from, time: opts.weighTime, title: 'Weigh in (Shredded System)', desc: 'After the toilet, before food or drink. Enter it on Today.', rrule: 'FREQ=DAILY' }));
    for (const d of opts.carbupDates) lines.push(...event({ uid: `carbup-${d}`, date: d, time: '08:00', title: 'Carb-up day', desc: 'Maintenance calories, protein the same, fat 40-50 g, carbs 200-300 g. Planned, not a cheat day.' }));
    if (opts.trainDays.length) lines.push(...event({ uid: 'training', date: opts.from, time: opts.trainTime, minutes: 45, alarm: 30, title: 'Training session', desc: 'Full Body A or B. Stop 1-2 reps short of failure on compounds.', rrule: `FREQ=WEEKLY;BYDAY=${opts.trainDays.map((n) => BYDAY[n]).join(',')}` }));
    lines.push('END:VCALENDAR');
    return `${lines.map(fold).join('\r\n')}\r\n`;
  }
  return { build };
})();
