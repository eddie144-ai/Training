# Shredded Trainer

Trainer and Shredded System in one app, set up for the cut: **My 4-Week Program** (your modified
"10 lbs of muscle in 4 weeks") paired with the **Gironda diet**, from 95 kg toward 70–75 kg.

Open **https://eddie144-ai.github.io/Training/shredded-trainer/** (capital T) and install it from Chrome's
menu. It's a copy of Trainer with its own data (`shtrainer.*` keys), so Trainer keeps working as it is.

## First open
You choose to **bring over your Trainer data** (weigh-ins, sessions and exercise weights, meals,
chains, goals, journal) or start fresh. Bringing it over copies Trainer's saved data once; Trainer is
never changed, and from then on the two apps keep separate data. Either way the cut set-up is applied:
the 4-week cycle as the active programme, a 75 kg target with 70 kg as the lowest goal, and a carb-up every
96 hours.

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
| Fuel → Log | **Scan a barcode** (camera on Chrome for Android, or type it). Open Food Facts lookup, added by grams, remembered offline. |

## Files
`index.html`, `data.js` (Trainer's programmes, recipes and content), `app.js` (Trainer plus the cut
module), `photos.js`, `scan.js`, `reminders.js` (shared with Shredded System), `sw.js`, `manifest.json`,
`icons/`, `tests/app.test.mjs`.

## Tests
```bash
npm i playwright          # once
node shredded-trainer/tests/app.test.mjs
```
11 tests: the welcome and data copy (Trainer untouched, only `shtrainer.*` written), the 4-week
programme by week, the carb-up clock and chains, red flags and check-in, the weekly decision and the
calorie floor, barcode logging, photos, the calendar file, every tab rendering, and offline use.
