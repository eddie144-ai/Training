# Iron & Eggs Classic (Shredded Trainer)

The original Iron & Eggs app, renamed Iron & Eggs Classic (home-screen name "I&E Classic") when `gym-fuel/` took the
Iron & Eggs name. Data and storage keys are unchanged.

Trainer and Shredded System in one app, set up for the cut: **My 4-Week Program** (your modified
"10 lbs of muscle in 4 weeks") paired with the **Gironda diet**, from 95 kg toward 70–75 kg.

Open **https://eddie144-ai.github.io/** and install it from Chrome's menu. That's the main copy, built from
this folder by `home-page/build.mjs`. The same app still runs at `/Training/shredded-trainer/` with the same
data (one origin, one `shtrainer.*` store) and a note pointing to the main address.

Hero → **Apps** lists the other apps (Council daily; Deliberation Council and MASSA as tools; older apps
folded away) and has **Back up everything**: one file with every app's data (a fixed key list, so API keys
never leave the phone; photos aren't included), plus Restore. Today nudges when there's been no backup for
a week.

## First open
You choose to **bring over your Trainer data** (weigh-ins, sessions and exercise weights, meals,
chains, goals, journal) or start fresh. Bringing it over copies Trainer's saved data once; Trainer is
never changed, and from then on the two apps keep separate data. Either way the cut set-up is applied:
the 4-week cycle as the active programme, a 75 kg target with 70 kg as the lowest goal, and a carb-up every
96 hours.

## Today, in order
1. **Eating today:** tap **18:6 window**, **One meal** (any time, one sitting: everything within 2 hours
   of the first bite) or **Fast day**. The diet chains follow whichever you pick.
2. **Diet & health chains:** diet dialled in, cut day, **fasting kept**, **protein hit**, training plan
   followed, **4 sessions this week** (Monday to Sunday, +20 XP a week), steps (weekly) and sleep 7.5 h+.
   The four diet chains **tick themselves**: a day counts as kept unless your log shows otherwise (a meal
   outside the window, a second sitting, food on a fast day, something off the Gironda plan) or you tap
   **I broke it**. Tap it again to go back to automatic. Protein isn't judged on one-meal or fast days.
3. Daily checklist (tap Meal 1 or Meal 2 to log it), then **Log** for weight and last night's sleep.
4. **Clean chains:** no coffee, your own "No ___" chains and tomorrow planned.
5. Carb-up clock, cut check-in and red flags.
6. **A little for everything else:** one tap each for YouTube, wealth, and family & the rest (+3 XP each).

Your personal chains (such as No energy drinks) aren't in this public code: add them in Hero → Chains,
copy them from Trainer (Body → Setup), or import them from a private goal-pack link.

## Training
- **Previous weights are built in:** your last Grok-tracker numbers for all 22 exercises of My 4-Week
  Program show as starting points (a newer weight already on the phone is kept).
- Each set has its own kg and reps, so 25, 25, 20, 15 logs as it happened. **+ Add set** adds extra sets
  (starting at the weight of the set before); **Fill from last time** brings back extra sets too.
- **How did it feel?** Rough to Great plus a session note, saved with the session and shown in history.
- A half-logged session is kept on the phone if the app closes mid-workout.
- **Next month:** in week 4 Today says when the programme ends; from Monday 2 November it offers to switch
  to **Mike Mentzer HIT** (or run the 4 weeks again, or remind you next week).

## Everything from Trainer
Chains (no coffee, diet, cut day, training, steps, sleep, planning, your own), both programme families
(the 4-week cycles and Mentzer HIT), the eating window and extended fasts, Dolce recipes and the
shopping list, goals, journal, dreams, channel, Garmin entries, XP and achievements.

## Added from Shredded System
| Where | What |
|---|---|
| Today | **Carb-up clock** (replaces Trainer's 6-week refeed blocks): due every 72, 96 or 120 hours, with the next training day suggested. A carb-up day keeps the diet and cut-day chains. |
| Today | **Cut check-in**: hunger and energy (1–5), symptoms, and a medication note (a record only; no dose advice). Red-flag symptoms put medical advice at the top of Today. |
| Body → Weight | **This week's decision** from 14 days of data (rate, cut-day chain, waist, strength, energy), with an Apply button that changes the calorie target (never below 1,500 kcal). **Timeline** to 90, 85, 80, 75, 72.5 and 70 kg. |
| Body → Tape | **Progress photos** (front, side, back), first vs latest, stored only on the phone. |
| Body → Guide | How the programme and the Gironda diet fit together on a cut, the carb-up rules, safety and links to the PDFs. |
| Body → Setup | Carb-up interval, lowest goal, and a **calendar file** of reminders: daily weigh-in, carb-up days for 12 weeks, training days (from Plan → Week, or Mon/Tue/Thu/Fri). |
| Body → Garmin | **Import from Garmin**: choose the zip from Garmin Connect (Account → Data management → Export your data) and weeks of steps, resting heart rate, Body Battery, stress, respiration, intensity minutes and sleep load at once. Only the daily-summary and sleep files are read; a sleep you logged by hand is kept. |
| Body → Setup | **Look:** the Gironda background (default), your own photo (kept only on the phone) or plain. **From Trainer:** copy just your chains (your own "No ___" chains, their check-ins and the no-coffee start) or everything, any time. |
| Fuel → Log | **Scan a barcode** (camera on Chrome for Android, or type it). Open Food Facts lookup, added by grams, remembered offline. |

## Home page
Shredded Trainer saves a small summary of your chains (`shtrainer.chains`: name, current and best streak,
today's status) whenever they change. The home page at **https://eddie144-ai.github.io/** (repository
`eddie144-ai.github.io`) reads it to show every chain at a glance. It never leaves the phone.

The built-in chains restarted on 10 Oct 2026 (`CHAINS_RESET` in `app.js`): that day is day 1 for the daily chains
and the weekly ones count from that week. Your own "No ___" chains keep their count. Nothing in the log is changed,
and best streaks, XP and achievements are kept.

Your own chains in Trainer on the same phone are added automatically when Iron & Eggs opens, with their check-ins
(each one once, so a chain deleted here stays deleted). A slip copied from Trainer breaks the chain even before
the day the chain was added here.
Gym & Fuel shows the same list on its Today screen.

## Logo
The Iron and Eggs logo (cast-iron pan with a fried egg) is `icons/logo.jpg`, shown at the top of Today. The pan and
egg cut out as a circle make the header mark (`icons/logo-mark.png`) and the home-screen icons (`icons/icon-*.png`).

## Background photo
Vince Gironda, *Tomorrow's Man*, June 1953, Irvin Johnson Health Studio. Public domain in the US
(published 1931–63, copyright not renewed), loaded from
[Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Vince_Gironda_Tomorrows_Man_v1_n5_1953.jpg)
and cached by the service worker for offline use.

## Files
`index.html`, `data.js` (Trainer's programmes, recipes and content), `app.js` (Trainer plus the cut
module), `photos.js`, `scan.js`, `reminders.js` (shared with Shredded System), `sw.js`, `manifest.json`,
`icons/`, `tests/app.test.mjs`.

## Tests
```bash
npm i playwright          # once
node shredded-trainer/tests/app.test.mjs
```
23 tests: the welcome and data copy (Trainer untouched, only `shtrainer.*` written), the 4-week
programme by week, the carb-up clock and chains, red flags and check-in, the weekly decision and the
calorie floor, barcode logging, photos, the calendar file, the new chains, the quick log, goal-pack import, the chain summary, copying chains from Trainer, the background, built-in previous weights,
eating modes and auto-kept chains, the all-apps backup and restore, the fast timer from midnight, the workout log (extra sets, feel, surviving a reload), the Mentzer switch,
every tab rendering,
and offline use.
