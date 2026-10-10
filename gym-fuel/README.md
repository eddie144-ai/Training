# Gym & Fuel

Iron & Eggs (`shredded-trainer/`) stripped down to just the gym and nutrition. An offline-first web app with no
build step and no dependencies; data lives in the browser's `localStorage` under `gymfuel.*`.

**[▶ Open Gym & Fuel](https://eddie144-ai.github.io/Training/gym-fuel/)**: open it in Chrome on Android and tap **⋮ → Install app**,
or in Safari on iPhone and tap **Share → Add to Home Screen**.

## Sharing it
Send the link. Each phone keeps its own data, so a friend starts with an empty app. On first open they're asked
to **set up their targets**: sex, age, height, weight now, target weight, activity and a programme. The app
suggests calories (Mifflin-St Jeor maintenance, −500 kcal to lose or +300 to gain, with a 1,500/1,200 kcal
floor), protein (about 2 g per kg, of target weight when cutting), fat (25% of calories) and carbs (the rest).
Every number can be changed before saving. Today shows a reminder until it's done, and Body → Settings can run it
again.

## What's in it
- **Today:** the next session of your active programme with a Start button, today's calories and protein left
  with macro bars, quick add and barcode scan, today's weight, and the week so far (sessions, average kcal and
  protein).
- **My chains (Today):** on a phone with Iron & Eggs, every chain from it (No coffee, your own "No ___" chains,
  diet, cut, fasting, protein, training, sessions, steps, sleep, plan) with its day count and best, read from the
  summary Iron & Eggs writes (`shtrainer.chains`). Clean chains (No coffee and your own) keep counting by the
  days since Iron & Eggs last wrote; the rest show where Iron & Eggs left them. Every chain restarted at day 1 on
  10 Oct 2026 (best streaks kept).
  Check-ins and slips stay in Iron & Eggs (**Open Iron & Eggs**). Hidden on phones without it.
- **Gironda bar (Fuel → Log):** one tap logs Gironda Meal 1 (6 eggs + 3 pork patties) or Meal 2 (6 eggs + 250 g
  steak) for the day on screen, tap again to take it off, with a 0/2 count. On when Iron & Eggs is on the phone or
  a Gironda meal has been logged; **Body → Settings → Gironda bar in Fuel** switches it. Those two meals then
  stay out of quick add.
- **Train → Workout:** the 4-week cycles (My 4-Week Program, 10 lbs of Muscle in 4 Weeks) and Mentzer HIT
  (beginner, intermediate and advanced routines). Per-set kg and reps, **+ Add set**, **Fill from last time**,
  last weights in a circle, progression hints, Rest-Pause/hold logging for techniques, how the session felt, and
  a half-logged session survives the app closing. Edit exercises, days and supersets; reset to the original.
- **My workouts (Train):** a third tab next to the 4-week cycles and Mentzer HIT. **+ Create a workout programme**
  makes a blank one (1–7 days, optional rest between sessions) or a copy of any programme; it opens in Edit,
  where you name the programme and each day, add exercises from the library or your own, set sets, reps,
  supersets and techniques, move days earlier or later, add or delete days, and delete the programme. Any
  built-in programme can be copied to My workouts from Edit.
- **Adaptive calorie target:** from 8+ weigh-ins over 14+ days and 12+ days of food logged in the last 21 days,
  the app works out your real maintenance (average intake − weight trend × 7,700 kcal per kg, the trend being a
  straight line through the weigh-ins) and suggests a target to lose 0.5 kg a week, gain 0.25 kg a week or hold,
  moving at most 300 kcal a week and never below 1,500 kcal (men) or 1,200 kcal (women). **Use** changes the
  calories, keeps protein and splits the rest between carbs and fat as they are now. It shows on Today when a
  change of 100+ kcal is due (**Not this week** hides it until Monday) and always in Body → Weight, with what's
  still needed before it can work.
- **Exercise library:** 876 exercises from [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
  (public domain, `exercises.json`, trimmed; licence in `exercises-LICENSE.md`), loaded the first time Train opens.
  Each exercise in a workout has **How to do it** (start and end pictures, muscles worked, equipment, level and
  numbered steps), matched by name, a short alias list for generic names ("Deadlift", "Pec Deck") or the closest
  name containing every word of yours. **Find it in the library** appears when there's no good match: **Link**
  keeps your exercise's name and adds the how-to; **Swap** changes the exercise. In Edit exercises,
  **+ Add exercise** picks from the library (search, muscle and equipment filters) or lets you type your own.
  Pictures load from GitHub and are cached once seen. The data is public domain; the pictures' licence is less
  clear upstream, which is fine for personal use.
- **Train → History:** a **progress chart** per lift (best estimated 1-rep max each session; tap a dot for the set;
  a table view underneath), every session (tap for the sets) with PR tags, and personal records as estimated
  1-rep max (tap one to chart it).
- **Quick add** buttons (Today and Fuel) are your own most-logged foods from the last 30 days, so a new user sees
  none until they've logged something.
- **Fuel → Log:** meals by day and slot, totals against your targets, add from the food library, one-off meals,
  barcode scan (Open Food Facts), copy the day before, edit or delete.
- **Photo logging:** **Photo of food or label** (Today and Fuel) takes or picks a photo of a meal, drink, snack,
  packet, nutrition label or menu, with an optional note ("fried in 1 tbsp butter"). With an AI key (Body → Settings),
  **Work it out with Gemini/Claude** returns each food with grams, calories, protein, carbs and fat and how sure it
  is; every number can be changed (changing grams rescales the item), items removed or added, then added to the log
  with the photo attached. Without a key, **Enter it myself** attaches the photo to a one-off meal. Meal photos stay
  on the phone (IndexedDB) and are deleted with the last meal that uses them. Two providers in `foodai.js`, same
  prompt and JSON schema:
  - **Gemini (free tier):** uses the Gemini key Deliberation Council saved on the phone (`gemini_api_key`, shared
    because both apps are on the same site) or one entered here, and Deliberation Council's model (default
    `gemini-3.8-flash`) unless changed here. `generateContent` with `responseJsonSchema`, called with fetch as
    Deliberation Council does. Chosen by default when a Gemini key is on the phone and no Anthropic key is. Google's
    free tier has daily limits and may use what's sent to improve its products.
  - **Claude (paid):** the official SDK (`@anthropic-ai/sdk` 0.132.0 from jsDelivr, loaded on first use,
    `dangerouslyAllowBrowser` because the key is the user's own): Claude Opus 5.5 by default (Sonnet 5.5 or Haiku 5.5
    selectable), effort medium, a JSON-schema structured output, and the server-side refusal fallback
    (`fallbacks: "default"`) on Opus and Sonnet.
  Keys are kept in this browser only, outside the app data, so they're never in backups.
  - **Free (no key):** once the Worker in `worker/` is deployed (see `worker/README.md`), photos go to it instead:
    it reads them with the owner's Gemini key, kept secret on Cloudflare, capped at 10 photos a day per connection
    and 200 for everyone. It's the default when the user has no key of their own.
- **Share my week:** a 1080 × 1350 image of the week so far (weight with this week's and total change and a 4-week
  trend line, sessions, average calories and protein, best lifts as estimated 1-rep max with the change from before
  this week, an optional handle, and the app's address), drawn on a canvas in `share.js`. **Share** opens the
  phone's share sheet, **Save image** downloads it. Nothing leaves the phone unless shared.
- **Cut with me:** a 30-day challenge started from Today: day N of 30, sessions (target 3) and weigh-ins (target 7)
  this week, and the day on every share card.
- **Backups:** **Send a backup to Drive, email or a chat** uses the share sheet (download where there's none); Today
  reminds you once there's a log to lose and no backup in 7 days ("In a few days" snoozes it for 3).
- **Installing:** a card on Today (until installed or dismissed) and a note in the welcome sheet with the steps for
  iPhone (Safari → Share → Add to Home Screen) or Android (Chrome ⋮ → Install app), or an **Install** button where
  Chrome offers one.
- **For new users:** setup preselects the general 10 lbs programme, not the owner's own 4-week plan; Settings has a
  plain background option and the handle shown on share cards.
- **Fast days:** **Mark as a fast day** (Today and Fuel, when nothing is logged yet) records a deliberate fast. The
  adaptive target counts it as a logged day at 0 kcal (plus anything eaten), instead of skipping it.
- **Food search:** typing 3+ letters in Add food also searches Open Food Facts by name
  (`search.openfoodfacts.org`) after a short pause, keeps answers for the session (the service allows about 10
  searches a minute) and adds products by grams. Products you add are saved and listed offline next time.
- **Scanning on any phone:** where the browser has no barcode scanner of its own (iPhone Safari, desktop), the
  [barcode-detector](https://www.npmjs.com/package/barcode-detector) polyfill (ZXing in WebAssembly, pinned
  3.2.2 on jsDelivr) loads the first time the camera opens; the service worker keeps it for offline use.
- **Fuel → Recipes:** the Gironda staples and 43 Dolce recipes with macros, ingredients and method, plus your own
  foods.
- **Body → Weight:** weigh-ins, 7-day average, progress from start to target and a 60-day trend line.
- **Body → Measurements:** waist, chest, arms, thighs, hips and neck (cm), change since your first entry, a
  waist trend line, a US Navy body-fat estimate (men and women, with your height set) and the history.
  **Progress photos** (front, side, back) show your first next to your latest. They're stored only on the phone
  (IndexedDB) and aren't in backups.
- **Body → Settings:** calorie and macro targets, start and target weight, height, sex, redo the setup, cycle start, copy from Iron & Eggs,
  backup and restore, high contrast, delete all data.

## Left out from Iron & Eggs
Chains, XP and levels, goals, journal and dreams, fasting and the eating window, carb-up clock and cut check-ins,
Garmin, sleep, fluids, planning and shopping, the channel and the other apps.

## From Iron & Eggs
On first open (or Body → Settings) you can bring over weigh-ins, measurements, sessions, exercise weights, programmes, meals,
your foods, macro targets and progress photos from Iron & Eggs in the same browser. Iron & Eggs is only read, never changed.

## Files
`index.html` (page and styles), `data.js` (programmes, staples, recipes, methods, Mentzer levels and
techniques, from Iron & Eggs), `scan.js` (barcode lookup, name search and the scanner polyfill loader), `photos.js` (progress and meal photos), `foodai.js` (photo logging with Gemini or Claude), `share.js` (share cards and the share sheet), `exercises.json` + `exercises-LICENSE.md` (exercise library), `app.js`, `bg.jpg`
(background photo), `sw.js`, `manifest.json`, `icons/`, `tests/app.test.mjs`.

## Tests
```bash
npm i playwright          # once
node gym-fuel/tests/app.test.mjs
```
