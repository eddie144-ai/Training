# Life RPG

The 4 pillars (Health & Wellness, Wealth & Career, Family & Personal, Technology & Learning) as
one-tap quests, with six stats, HP, streaks and levels. It's built for high openness and low
conscientiousness: every quest is one tap or one number, and Trainer fills in what it already knows.

Same architecture as Trainer: `index.html` (page and styles), `data.js` (stats, pillars, goals,
quests, rules), `trainer-adapter.js` (the only code that reads Trainer's data), `app.js` (engine and UI),
`manifest.json`, `sw.js` and `icons/`. There's no build step. Data lives in `localStorage` under
`liferpg.v1` (schema version 2). Served at `<site>/liferpg/`.

What it reads and writes, and in what order of precedence: [STORAGE.md](STORAGE.md).

## Tabs
- **Today:** the HUD (level, HP, XP, STR/VIT/INT/DISC/CAP/CHA), today's quests by pillar, and the
  weekly quests. ◀ ▶ lets you fix a past day. The **quick dock** above the tab bar logs Workout (on
  training days), Steps, Meal 1, Meal 2, Business task, Kids time and AI build in one tap.
- **Quests:** the pillar → goal → quest tree with the last 7 days as dots. Tap a quest to rename it,
  change its XP, target or stat, make it core, or switch it off. **+ Add quest** adds your own.
- **Hero:** character sheet, stat bars, a 5-week calendar, the combat log (HP lost, respecs, ended
  streaks, full weeks), the append-only activity log, your Big Five trait profile and the rules.
- **Setup:** training days, grace window and pauses; the alcohol and coffee rules, HP penalty and
  regeneration, respec on/off and what a perfect day needs; start date; the Trainer link; contrast;
  backup and restore (trait scores left out unless ticked); privacy and deleting your data.

## Rules
| Rule | How it works (defaults; all adjustable in Setup or Quests) |
|---|---|
| Core quests | Training session, Gironda meal 1, Gironda meal 2, zero alcohol. Each missed core quest costs 10 HP once its day (or training window) is over. |
| Perfect day | All core quests done or neutral, at least one done. +10 HP, +20 DISC (for up to 5 days a week), streak +1. Can be set to need every quest. |
| Training schedule | The session shows only on training days (Mon and Thu by default; Trainer's plan wins on days it covers). Recovery days are neutral. A missed session has a 1-day grace window, ending before the next scheduled day; training inside it marks the session as moved. Pauses for illness, injury or doctor's orders are neutral. |
| Zero coffee | Off by default. With it on, Trainer's coffee check-ins count. |
| Streak multiplier | ×1.0, then +0.1 for each perfect day in a row, up to ×1.5. |
| Respec | At 0 HP you lose the XP inside your current level and HP refills. A tap that would cause one asks first; one caused by days passing is shown once for you to acknowledge. Can be switched off. |
| Weekly quests | Pay out on the day you tick them. All of them in one week: +50 DISC. |
| Levels and stats | Level L starts at 125·L·(L−1) XP. A stat's value is 1 + √(XP/10), capped at 99. |

Everything is recalculated from the logs on each render, so reopening a day can't pay out twice and
editing a past day can never leave XP or HP wrong. Every change you make is appended to an activity log
(Hero), which only **Delete all** removes.

## Trainer link
Read-only, through `trainer-adapter.js`, which reads only `shtrainer.v1` (Shredded Trainer), falling back to `trainer.v1`, and validates every field
(STORAGE.md has the full contract). It fills in: training sessions and Trainer's train/rest/fast plan,
lifting volume (kg × reps), steps (including Garmin entries), Gironda meal 1 and meal 2 (Trainer's
`gironda1`/`gironda2` meals; fast days are neutral) and, if you turn the rule on, coffee check-ins.

Anything you tap wins. Where you've overridden Trainer, the quest shows **Edited · Trainer says …**
and a **Use Trainer** button that removes your entry. Trainer itself is never changed.

## Tests
```bash
npm i playwright          # once
node liferpg/tests/liferpg.test.mjs
```
19 tests: storage writes, adapter isolation, override precedence, the training schedule, idempotency,
midnight and BST/GMT changes, past-day edits, malformed Trainer data, a corrupted save, the v1→v2
migration, backup round trip, stat caps, respec confirmation, the coffee rule, accessibility, mobile
layout and the service worker (offline restart and picking up a deploy).

## Install on Android
Host the repo over HTTPS (GitHub Pages), open `<site>/liferpg/` in Chrome, then tap **⋮ → Install app**.
It works offline after the first load. Back up from Setup: clearing Chrome's site data deletes it.
