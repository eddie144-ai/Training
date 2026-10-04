# Life RPG storage contract

Life RPG runs on the same origin as Trainer (`eddie144-ai.github.io`), so it shares that origin's `localStorage`. Storage is separated by origin, not by folder, so any script on the origin can read any key. This document says exactly what Life RPG reads and writes.

## What Life RPG writes

| Key | When | Contents |
|---|---|---|
| `liferpg.v1` | Every change | The whole Life RPG state as JSON (schema below). The key name is the namespace; the schema version is the `v` field inside it. |
| `liferpg.corrupt.v1` | Only if `liferpg.v1` can't be parsed on load | The unreadable text, kept so it isn't overwritten. |

Life RPG never calls `setItem`, `removeItem` or `clear` on any other key. **Delete all Life RPG data** calls `removeItem('liferpg.v1')` only, never `clear()`. The test suite checks this by recording every storage write during a full session (`tests/liferpg.test.mjs`, "writes only liferpg.* keys").

Life RPG stores no passwords, tokens or account details. It can hold personal data you enter (quest logs, Big Five scores), which never leaves the phone unless you export a backup. Trait scores are left out of backups unless you tick **Include my trait profile**.

## What Life RPG reads from Trainer

Only through `trainer-adapter.js`. It calls `localStorage.getItem('shtrainer.v1')` (Shredded Trainer, the daily log since 5 October 2026) and, only if that is missing, `localStorage.getItem('trainer.v1')` (the original Trainer). Nothing else: no enumeration of keys, no other apps' data. It never writes to either. Both use the same field names, so the table below applies to whichever is read.

| Trainer field | Expected type | Used for | Validation |
|---|---|---|---|
| `workouts[].date` | `"YYYY-MM-DD"` | Training session done | Entries with any other date format are dropped |
| `workouts[].entries[].sets[].kg`, `.reps` | number ≥ 0 | Lifting volume (Σ kg × reps) | Non-numbers (including numeric strings), negatives, NaN, kg > 1000 and reps > 500 are dropped |
| `meals[].date`, `meals[].ref` | date, string | Gironda meal 1 (`ref: "gironda1"`), meal 2 (`"gironda2"`) | Bad dates and non-string refs dropped |
| `plans[date].kind` | `"train"` \| `"rest"` \| `"fast"` | Training schedule (overrides Life RPG's training days); fast days make the meal quests neutral | Any other value ignored |
| `days[date].steps` | number 0–200,000 | Steps quest | As above |
| `garmin[date].steps` | number 0–200,000 | Steps quest when `days[date].steps` is missing | As above |
| `days[date].chains.cut` | boolean | `false` marks both Gironda meals missed (Trainer's own correction) | Non-booleans ignored |
| `days[date].chains.coffee` | boolean | Zero-coffee rule, only if you switch that rule on | Non-booleans ignored |
| `days[date].fast` | `true` | Fast day (meals neutral) | Anything but `true` ignored |

Units: kg and steps. Dates are local calendar dates as Trainer writes them.

If neither key is present (or the one read is unparseable or not an object), the adapter returns an error code (`missing`, `corrupt`, `shape`, `unavailable`) and Life RPG behaves as if Trainer weren't there. Setup shows which.

## Precedence

For each quest and day:

1. **Your entry in Life RPG** (`S.log[date][questId]`) wins.
2. Otherwise **Trainer's value**, if the adapter has one.
3. Otherwise the quest's default: open today, missed on a past day; clean quests (zero alcohol) count as kept on a past day.

Overriding never changes Trainer. Where you've overridden a Trainer value, the quest shows an **Edited · Trainer says …** badge and a **Use Trainer** button, which deletes your entry so Trainer's value applies again.

## Life RPG schema (version 2)

```ts
{
  v: 2,
  created: 'YYYY-MM-DD', start: 'YYYY-MM-DD', notice: 'welcome' | null,
  settings: { highContrast, trainer, trainDays: number[] /* 0 = Sun */, graceDays, abstainAlcohol, abstainCoffee,
              hpMiss, hpRegen, respec, perfectMode: 'core' | 'all', discPerfectCap },
  log:    { [date]: { [questId]: true | false | 'rest' | number } },
  week:   { [monday]: { [questId]: dateDone } },
  edits:  { [questId]: { label?, xp?, target?, stat?, off?, core? } },
  custom: [{ id, goal, label, type: 'daily' | 'weekly', xp, stat, metric: 'binary' }],
  pauses: [{ id, from: date, to: date | null, reason: 'ill' | 'injury' | 'clinician' | 'other' }],
  traits: { O?, C?, E?, A?, N? },
  events: [{ at: ISO time, kind, ... }],   // append-only activity log
  ack:    { respecs: number },
}
```

XP, HP, levels, stats and streaks are never stored. They're recalculated from the logs on every render, so changing the XP curve or the rules can't corrupt a save, and reopening a day can't pay out twice.

## Migrations

`migrate()` in `app.js` runs on load and on restore.

| From | To | Change |
|---|---|---|
| 1 | 2 | The single `gironda` quest becomes `meal1` and `meal2` (each takes the old value); `edits.gironda` is dropped; settings gain the schedule, rule and HP options with defaults; `pauses`, `events` and `ack` are added; a `migrate` event is logged. |

Version 1 saves are restored the same way. Saves newer than the app's version are refused by restore.

## Service worker

`sw.js` is scoped to `/liferpg/`. It fetches every file from the network first and uses the cache only when offline, so a deploy is picked up on the next online load even if `VERSION` wasn't bumped. A new worker takes over with `skipWaiting` and `clients.claim`, and the page reloads once (unless a dialog is open).
