# Gym & Fuel

Iron & Eggs (`shredded-trainer/`) stripped down to just the gym and nutrition. An offline-first web app with no
build step and no dependencies; data lives in the browser's `localStorage` under `gymfuel.*`.

Served at `<site>/gym-fuel/`. Open it in Chrome on Android and tap **⋮ → Install app**.

## What's in it
- **Today:** the next session of your active programme with a Start button, today's calories and protein left
  with macro bars, quick add and barcode scan, today's weight, and the week so far (sessions, average kcal and
  protein).
- **Train → Workout:** the 4-week cycles (My 4-Week Program, 10 lbs of Muscle in 4 Weeks) and Mentzer HIT
  (beginner, intermediate and advanced routines). Per-set kg and reps, **+ Add set**, **Fill from last time**,
  last weights in a circle, progression hints, Rest-Pause/hold logging for techniques, how the session felt, and
  a half-logged session survives the app closing. Edit exercises, days and supersets; reset to the original.
- **Train → History:** every session (tap for the sets) with PR tags, and personal records as estimated 1-rep max.
- **Fuel → Log:** meals by day and slot, totals against your targets, add from the food library, one-off meals,
  barcode scan (Open Food Facts), copy the day before, edit or delete.
- **Fuel → Recipes:** the Gironda staples and 43 Dolce recipes with macros, ingredients and method, plus your own
  foods.
- **Body → Weight:** weigh-ins, 7-day average, progress from start to target and a 60-day trend line.
- **Body → Measurements:** waist, chest, arms, thighs, hips and neck (cm), change since your first entry, a
  waist trend line, a US Navy body-fat estimate (with your height set) and the history.
- **Body → Settings:** calorie and macro targets, start and target weight, height, cycle start, copy from Iron & Eggs,
  backup and restore, high contrast, delete all data.

## Left out from Iron & Eggs
Chains, XP and levels, goals, journal and dreams, fasting and the eating window, carb-up clock and cut check-ins,
Garmin, sleep, fluids, planning and shopping, the channel, progress photos and the other apps.

## From Iron & Eggs
On first open (or Body → Settings) you can bring over weigh-ins, measurements, sessions, exercise weights, programmes, meals,
your foods and macro targets from Iron & Eggs in the same browser. Iron & Eggs is only read, never changed.

## Files
`index.html` (page and styles), `data.js` (programmes, staples, recipes, methods, Mentzer levels and
techniques, from Iron & Eggs), `scan.js` (barcode lookup, shared with Iron & Eggs), `app.js`, `bg.jpg`
(background photo), `sw.js`, `manifest.json`, `icons/`, `tests/app.test.mjs`.

## Tests
```bash
npm i playwright          # once
node gym-fuel/tests/app.test.mjs
```
