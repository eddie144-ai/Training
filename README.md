# Trainer: RPG habit, training and nutrition companion

An offline-first web app for the cut from about 90 kg to 75–77 kg. It combines strict daily
chains (no coffee first), an 18:6 eating window with extended fasts, Mike Mentzer's
high-intensity training, the Dolce Diet and your 4-week muscle cycle, with RPG levels and stats.

The files are `index.html` (page and styles), `data.js` (programs, recipes and methods,
techniques, fasting stages, goals and prompts), `app.js` (logic), `manifest.json`, `sw.js`
(offline cache) and `icons/`. There's no build step and no dependencies. Data lives in the
browser's `localStorage`.

## Version 3 fresh start
The first time version 3 opens, it wipes the old data except **the last weight and reps for
each exercise**, which show in Train as starting points. The old data is kept aside on the
phone (Body → Settings → Copy old data) until you delete it. Chains start on **1 October 2026**.

## Tabs
- **Today**
  - Level, XP and a 7-day average weight.
  - The eating window (default 09:00–15:00, 18:6) with a live fasting timer.
  - Extended fasts: 24–72 h goals, stages, electrolyte reminders and safety notes.
  - Chains: no coffee, diet dialled in, training plan followed, steps, tomorrow planned.
  - Today's daily goals and this week's goal progress.
  - Support for the first days without coffee.
  - Today's plan as a checklist: tap a planned meal to log it.
  - The plan-tomorrow prompt, which unlocks after your last meal.
  - Quests (none has a time window), fluids, a Stoic quote and the daily rhythm.
- **Plan**
  - **Tomorrow:** train, rest or fast; an optional sweat-suit walk; Breakfast, Lunch and Dinner from drop-downs,
    with planned macros; and your top 3, which become that day's goals.
  - **Week:** a loose weekly plan for the weekend. Suggested training days are spaced for
    recovery; add fast days and batch-cook days. You're warned about back-to-back HIT days,
    training straight off a fast, and fasts past 72 hours.
  - **Shopping:** a tickable list built from the next 7 days of planned meals.
- **Train**
  - Switch between the **4-Week Cycle** and **Mentzer HIT**.
  - HIT is split into three levels:
    - **Beginner:** 5-Day Break-in and Athlete's Routine.
    - **Intermediate:** Ideal Routine, Heavy Duty Principled Routine and Mentzer A/B.
    - **Advanced:** Consolidation Routines (1996 and 1998), the Ideal (Principled) Workout and
      Advanced Heavy Duty. It includes cards for Rest-Pause, Omni-Contraction, static holds
      (Max Contraction), failure + hold, Infitonic, forced reps and negatives.
  - Tag any exercise with a technique and the logger changes to match: singles with a
    10-second rest timer, or seconds held.
  - Starting weights match across programs, ignoring plurals.
- **Fuel**
  - **Log:** meals by slot, with meals outside the window flagged and the diet chain status.
  - **Recipes:** all 43 Dolce recipes as cards, showing macros, prep and cook time, tickable
    ingredients, numbered steps and batch tips. The **Add to…** menu logs a recipe today or
    plans it for tomorrow.
  - **Fluids** and **Stack:** the pre-workout stack has been removed.
- **Body → Garmin:** enter any day's Venu Sq data. Fields: steps, resting heart rate, Body
  Battery (on waking, high and low), stress, respiration, Pulse Ox, sleep and sleep score,
  intensity minutes, active calories, distance and max heart rate.
  - Shows 7-day averages against the week before, with 14-day sparklines.
  - Gives a recovery read, from waking Body Battery and resting heart rate against your own
    baseline, and shows it in Train too.
  - Plain-language notes on the trends.
  - Steps and sleep fill in the steps chain and the sleep log automatically.
- **Body:** weight, measurements, sleep and settings. Settings include the eating-window
  presets (16:8, 18:6, 20:4, OMAD), the chain start date, backup and restore, the old data,
  and **Reset all data** (with an option to keep exercise weights).
- **Hero**
  - Character, stats and achievements.
  - **Goals:**
    - **Daily:** one-off or every-day goals. It warns you past 3 every-day goals.
    - **Weekly:** goals with a target count, or counted automatically from your sleep log or
      training.
    - **Long-term:** goals and milestones.
    - **Rules:** your operating rules.
  - **Goal packs:** a goal pack arrives as a link. Opening it imports the goals and rules into
    this browser only; nothing personal lives in this code.
  - The gratitude journal, weekly review and self-authoring.
  - **Channel:** your YouTube channel link, and videos moving from idea to filming, editing and
    published, with thumbnails.
    - Weekly progress-video talking points built from your logs: weight trend, chains, steps,
      training and goals.
    - +15 XP for each published video.
  - A chain calendar where you can correct a day.

## Chains
Chains are strict: a missed day resets them to 0.

| Chain | Kept when |
|---|---|
| No coffee | You confirm the day was coffee-free (tea is fine). |
| Diet dialled in | Every meal is inside the window and calories are at or under target, or it's a fast day. |
| Training plan followed | You trained on a planned training day, or rested on a rest or fast day. With no plan, it counts while you're within 7 days of your last session. |
| Steps | Counted in weeks: 15,000 steps on 5 days, or 75,000 in the week. The first part-week is pro-rated. |
| Tomorrow planned | Tomorrow's plan is saved. |

## XP
XP is recalculated from your logs every time, so edits can never leave it wrong. You gain a new
level every 100 XP.

| Action | XP |
|---|---|
| Chain day kept | No coffee 5, diet 4, others 3 |
| Quest | 10 |
| Sweat-suit walk (bonus) | 5 |
| Weekly step target | 20 |
| Daily goal / all daily goals done / weekly goal reached | 2 / +5 / 15 |
| Session / personal record | 15 / +5 |
| Extended fast | 10 per full 24 hours |
| Weekly plan / weekly review | 20 / 20 |
| Achievement | 25 |

## Install on Android
Open **https://eddie144-ai.github.io/training/** in Chrome, then tap **⋮ → Install app**.
Open it once while online; after that it works offline. Your data stays on your phone, in
the browser's storage: nothing is uploaded here. Use **Body → Settings → Copy backup** now and
then, and keep the text somewhere safe.
