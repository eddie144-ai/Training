# Daily

**[▶ Open Daily](https://eddie144-ai.github.io/Training/daily/)** · open in Chrome or Safari, then install it from the browser menu (Add to Home Screen).

Iron & Eggs (`gym-fuel/`) and The Floor (`floor/`) on one screen, laid out as the day runs: open it in the
morning, work down the page, close it at night. The two full apps stay as they are; Daily is the one you open
every day, and you go into them for the deeper stuff (food search and photos, the workout logger, the girls log,
parked ideas, settings, backups).

## The screen
- **Up next:** the one thing to do now: the first thing not done whose time has come, with a button that does it
  (tick it, log the meal, jump to the box, or open Iron & Eggs to train). When this part of the day is done it
  shows what's coming later.
- **Score:** The Floor's six, four to count, with the 14-day strip (a bar under a day means you trained), plus
  protein eaten, kcal left and gym sessions this week from Iron & Eggs. In the evening it says how much protein
  is still to eat.
- **Morning (until 11:00):** up and outside, weigh-in, name today's brick, Gironda Meal 1.
- **Day (11:00 to 17:00):** the next session of your Iron & Eggs programme (the same one Iron & Eggs offers;
  HIT programmes wait out their rest days, the others aim for 4 a week), Gironda Meal 2, one proper meal, walk
  and steps, lay the brick, something for the girls and the next visit.
- **Evening (from 17:00):** screens off on time, mood and pain (mood 1–2 shows the support numbers), sleep,
  tomorrow's brick, today I did.
- **This week:** Monday to Sunday: Floor score, gym days and protein per day.

The section you're in is outlined. The recovery banner ("Yesterday slipped… never miss twice") is The Floor's.

## Data
Daily keeps nothing of its own. All three apps are on the same site, so they share the phone's
`localStorage`, and Daily reads `the-floor-v1` and `gymfuel.v1` fresh each time it draws and writes each change
straight back:
- **The Floor:** ticks, steps (which tick the walk, as in The Floor), bricks, mood, pain, sleep, "today I did".
  Only the day's fields are touched; every other field is kept as it is.
- **Iron & Eggs:** the Gironda meals, logged exactly as its Gironda bar logs them (tap again to take one off),
  and today's weigh-in (replaces any earlier one today). Logging a Gironda meal also ticks The Floor's
  "one proper meal". Nothing is written until Iron & Eggs has been opened once and set up.
- Unreadable data is shown as a warning and never overwritten.

Iron & Eggs and The Floor reload their data when they come back to the front or when Daily changes it while
they're open, so neither saves over what Daily wrote.

## Files and tests
`index.html` (page and styles, The Floor's look), `app.js`, `manifest.json`, `sw.js`, `icons/`. No build step,
no dependencies. From the repo root: `node daily/tests/app.test.mjs` (needs Playwright, see the root
`CLAUDE.md`); it runs Daily next to the real Iron & Eggs and The Floor.
