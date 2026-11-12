# Iron & Eggs (`gym-fuel/`)

Was Gym & Fuel; renamed Iron & Eggs (logo: the cast-iron pan with a fried egg, `icons/logo.jpg`, shown on Today
and the welcome sheet, with the round mark in the header and as the home-screen icon). Iron & Eggs Classic
(`shredded-trainer/`, the original app, renamed) stripped down to just the gym and nutrition. The folder, the `gymfuel.*` storage keys and the
backup format keep their old names so installed phones and old backups keep working. An offline-first web app with no
build step and no dependencies; data lives in the browser's `localStorage` under `gymfuel.*`.

**[▶ Open Iron & Eggs](https://eddie144-ai.github.io/Training/gym-fuel/)**: open it in Chrome on Android and tap **⋮ → Install app**,
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
- **Chains (Today):** abstinence streaks you keep in this app. Each has a name, a start date and a day count.
  The start date is day 1 (the same rule as Cut day). Add, edit, delete or reset one; reset sets the start date to
  today. The first time an existing log has no chains, three are filled in: No weed from 7 Jul 2026, No energy drinks
  from 15 Jul 2026 and No coffee from 2 Nov 2026. On 10 Nov 2026 those are day 127, day 119 and day 9, because the
  start date counts as day 1. A new phone
  with nothing logged yet starts empty, and deleting a chain does not bring it back. They're in backups.
- **My chains (Today):** No coffee, your own "No ___" chains (such as No weed and No energy drinks), Cut day and
  4 sessions this week, each with its day (or week) count and best, when those still come from the other apps.
  A chain with the same name as one kept here is shown only in Chains, so it isn't listed twice.
  - No coffee and your own chains come from Iron & Eggs Classic's summary (`shtrainer.chains`) and from Trainer
    (counted from their clean-since date and last slip). They keep counting by the days since the summary was
    written; check-ins and slips stay in Iron & Eggs Classic (**Check in on my chains**).
  - Cut day (only the two Gironda meals; a carb-up day or a day marked kept or broken in Iron & Eggs Classic wins) and
    4 sessions this week (Monday to Sunday) are worked out here from the food and sessions logged in this app and
    Iron & Eggs Classic, counted from 10 Oct 2026, with the best from the summary kept.
  - The imported card is hidden on phones with neither Iron & Eggs Classic nor Trainer.
- **Previous weights from your other apps:** each time the app opens it reads Iron & Eggs Classic (its
  sessions and the Grok-tracker starting weights built into it) and Trainer (`trainer.v1`), and for each exercise
  the newest weight becomes the starting point when it's newer than anything logged here ("From Trainer" or "From
  Iron & Eggs Classic"). Your own newer sessions always win; the other apps are only read. Shredded System
  isn't read: its exercise names don't match the programmes here. The old Trainer V6 app kept no lifts.
- **Gironda bar (Fuel → Log):** one tap logs Gironda Meal 1 (6 eggs + 3 pork patties) or Meal 2 (6 eggs + 250 g
  steak) for the day on screen, tap again to take it off, with a 0/2 count. On when Iron & Eggs is on the phone or
  a Gironda meal has been logged; **Body → Settings → Gironda bar in Fuel** switches it. Those two meals then
  stay out of quick add.
- **Quick meals (Fuel → Log):** one tap adds a preset to the day on screen (another tap adds another). The two
  starting presets are Gironda Meal 1, 6 eggs + 3 Lidl pork patties (933 kcal, P77, C4, F66) and Eggs + steak,
  6 eggs + 250 g rump (880 kcal, P95, C1, F55). Edit a preset or add your own. They're in backups; an old backup
  without them gets these two back. The staple list in `data.js` is unchanged.
- **Train → Workout:** the 4-week cycles (My 4-Week Program, 10 lbs of Muscle in 4 Weeks) and Mentzer HIT
  (beginner, intermediate and advanced routines). Per-set kg and reps, **+ Add set**, **Fill from last time**,
  last weights in a circle, progression hints, Rest-Pause/hold logging for techniques, how the session felt, and
  a half-logged session survives the app closing. Edit exercises, days and supersets; reset to the original.
  A session clock stays on screen and its length is saved with the workout (and so in the backup). Rest between
  sets defaults to 90 s (60, 120 or 180 on the exercise) and starts when weight and reps are both in, or when you
  tap Rest. It is timed from a timestamp, so leaving the app and coming back still shows the right seconds, and it
  beeps and vibrates when it ends. Tempo (for example 3-1-1-0) counts lower, hold and lift with a rep counter;
  turn it off when you don't want it. The screen stays awake during a session where the phone allows it.
- **My workouts (Train):** a third tab next to the 4-week cycles and Mentzer HIT. **+ Create a workout programme**
  makes a blank one (1–7 days, optional rest between sessions) or a copy of any programme; it opens in Edit,
  where you name the programme and each day, add exercises from the library or your own, set sets, reps,
  supersets and techniques, move days earlier or later, add or delete days, and delete the programme. Any
  built-in programme can be copied to My workouts from Edit.
  **Coach Mike:** **Send my log to Coach Mike** writes a short brief (the style, the next session, last weights,
  and any lift due a heavier load) you can share into his chat. **Use Coach Mike's programme** pastes his JSON
  reply into My workouts.
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
- **Read a nutrition label (Fuel → Log):** photograph a UK nutrition panel. The per 100 g column (kcal, fat, carbohydrate,
  protein) is read on the phone with Tesseract.js; kilojoules and the reference-intake column are ignored. The numbers
  stay editable, you type the grams eaten, and the log gets the scaled meal. If the photo doesn't read, type the per
  100 g figures yourself. **Save for next time** keeps the product (for example Asda roast chicken) in the backup, so
  the next meal is just the name and the grams. The reader downloads once, then works offline.
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
  **Auto-save to Google Drive** is off until you turn it on (Body → Settings). Google's sign-in script
  loads only after that. See [Google Drive auto-backup](#google-drive-auto-backup).
- **Installing:** a card on Today (until installed or dismissed) and a note in the welcome sheet with the steps for
  iPhone (Safari → Share → Add to Home Screen) or Android (Chrome ⋮ → Install app), or an **Install** button where
  Chrome offers one.
- **For new users:** setup preselects the general 10 lbs programme, not the owner's own 4-week plan; Settings has a
  plain background option and the handle shown on share cards.
- **Fasting (Today):** **Start a fast** runs a timer of days, hours and minutes, with no 24-hour cap, so a fast of
  several days keeps counting (3 days 4 hours stays 3 days, not 76 hours and not a clock that wraps at 24). **Stop
  fast** records the start, the end and the duration. Each calendar day the fast touches is also marked as a fast
  day. Finished fasts stay in the list. The timer updates while the app is open.
- **Fast days:** **Mark as a fast day** (Today and Fuel, when nothing is logged yet) records a deliberate fast. The
  adaptive target counts it as a logged day at 0 kcal (plus anything eaten), instead of skipping it. Timed fasts
  use the same `fastDays` flags.
- **Food search:** typing 3+ letters in Add food also searches Open Food Facts by name
  (`search.openfoodfacts.org`) after a short pause, keeps answers for the session (the service allows about 10
  searches a minute) and adds products by grams. Products you add are saved and listed offline next time.
- **Scanning on any phone:** where the browser has no barcode scanner of its own (iPhone Safari, desktop), the
  [barcode-detector](https://www.npmjs.com/package/barcode-detector) polyfill (ZXing in WebAssembly, pinned
  3.2.2 on jsDelivr) loads the first time the camera opens; the service worker keeps it for offline use.
- **Fuel → Recipes:** the Gironda staples and 43 Dolce recipes with macros, ingredients and method, plus your own
  foods.
- **Body → Weight:** weigh-ins, 7-day average, progress from start to target and a 60-day chart. The chart draws
  the raw weigh-ins and a 7-day rolling average over them, and states the current trend (that average) and how it
  changed over the last 7 days.
- **Milestones (Today):** a bar from the start weight (104.8 kg when that box is empty) on the cut date (1 Nov 2026)
  down to the target (75 kg). Badges at 100, 95, 90, 85, 80 and 75 kg. The first time a weigh-in reaches one, the card
  says so. Start weight and cut date are in Body → Settings.
- **Weekly report (Today):** Monday to Sunday. This week appears on Sunday; finished weeks stay in the list. Average
  weight and the change from the week before, sessions out of 4, days the protein target was hit, average kcal and
  carbs, chain day counts, and total session time. **Share this week** uses the phone's share sheet.
- **Strength PRs:** while you log a set, the exercise says if it is heavier than your best, more reps at that same
  weight, or a higher estimated 1-rep max. Train → History lists the best of each.
- **Swap:** on a workout exercise, **Swap** offers a kinder alternative for the left biceps (neutral grip, not a heavy
  supinated curl or chin-up), the left hip and knees (box squat, short-range leg press, hip thrust, light leg extension;
  not a deep lunge), or the lower back (chest-supported or machine row; not a conventional deadlift or good morning).
  The swap is for that session. The sheet says this is not medical advice and to follow your physio plan.
- **Yesterday:** if yesterday has no weigh-in or no food, Today offers a one-tap catch-up: log the weight, or add a
  Gironda meal for that date. Chains still count from their start date and break only when you reset one or change the date.
- **Diary:** short video notes (front or back camera), voice notes, or a clip already on the phone. Each one is
  stamped with the date and time, that day's weigh-in if one is logged, and the day of this cut (8 Nov 2026 is day 1).
  Title and note are optional. The clip stays on the phone (its own IndexedDB database, `gymfuel-diary`). Delete asks
  first. **Share** opens the phone's share sheet and **Save** downloads the file, so it can be edited into a documentary.
  The JSON backup and Drive auto-backup keep the date, weight, note and any YouTube link. They do not keep the video.
- **YouTube:** on a video entry, **Upload to YouTube**. Google sign-in uses the same client as Drive, and the
  YouTube permission is asked only when you tap **Upload now**. The title and description start filled in with the
  day and the weight. Privacy starts on **Private**; Unlisted or Public is a choice you make on that form. A progress
  bar runs during the upload, then the link is shown and remembered on the entry. Nothing is uploaded on its own.
  See [YouTube](#youtube).
- **Body → Measurements:** waist, chest, arms, thighs, hips and neck (cm), change since your first entry, a
  waist trend line, a US Navy body-fat estimate (men and women, with your height set) and the history.
  **Progress photos** (front, side, back) can be taken or uploaded for a chosen date. A slider compares any two.
  Each side shows the cut day (1 Nov 2026 is day 1, editable under Body → Settings) and the weight on or before that
  date. The picture stays on the phone. A backup keeps the date and the pose, not the file.
- **Body → Settings:** calorie and macro targets, start and target weight, height, sex, redo the setup, cycle start, copy from Iron & Eggs,
  backup and restore, high contrast, delete all data.

## Daily
[Daily](../daily/) puts this app and The Floor on one screen and can log the Gironda meals and today's weigh-in
into this app's data. Iron & Eggs reloads its data when it comes back to the front or Daily changes it, so it
never saves over what Daily logged.

## Left out from Iron & Eggs
XP and levels, goals, journal and dreams, the eating window, carb-up clock and cut check-ins,
Garmin, sleep, fluids, planning and shopping, the channel and the other apps.

## From Iron & Eggs
On first open (or Body → Settings) you can bring over weigh-ins, measurements, sessions, exercise weights, programmes, meals,
your foods, macro targets and progress photos from Iron & Eggs in the same browser. Iron & Eggs is only read, never changed.

## Google Drive auto-backup

Off unless you turn it on: Body → Settings → **Auto-save to Google Drive**. Send one manual backup first.
The app then keeps `iron-and-eggs-latest.json` in your Drive up to date, plus one `iron-and-eggs-YYYY-MM-DD.json`
for each day, about 45 seconds after a workout, weigh-in, meal or measurement changes, and again when you open
the app if the last upload was more than 6 hours ago. Nothing is sent while you're offline (it retries), while
the log is empty, or when the log has shrunk by more than about 30% since the last upload. Settings asks you
to confirm that. The sign-in token stays in memory for about an hour and is never written into the app's storage
or into a backup. Android is the reliable place for the Google sign-in popup.

The client id is already set in `drive.js`. The toggle still defaults off, so nothing is uploaded and Google's
script is not loaded until you switch auto-save on. The client was created like this (same steps to replace it):

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Google Drive API**.
3. On the OAuth consent screen choose **External** and **Testing**. Add the scope
   `https://www.googleapis.com/auth/drive.file` and add your Gmail address as a test user.
4. Create an OAuth client ID of type **Web application**. Authorised JavaScript origin:
   `https://eddie144-ai.github.io`. Leave redirect URIs empty.
5. Paste that client ID into `DRIVE_CLIENT_ID` at the top of `gym-fuel/drive.js`.

There is no client secret and no server. The scope is `drive.file` only, so the app can only see files it created.

## YouTube

A diary video can be sent to your channel from the entry: **Upload to YouTube**, check the title, description and
privacy, then **Upload now**. Privacy starts on Private. The app does not upload when you save an entry, when you
open the form, or on a timer. Voice notes are not offered for YouTube. The video file itself is not put in the
Drive backup; use **Share** or **Save** on the entry when you want the file for a documentary.

The sign-in is the same public web client as Drive (`225800622965-hsm5f4941gmjs9a0f0pvqnrhhoee9hpj`). The YouTube
permission (`https://www.googleapis.com/auth/youtube.upload`) is separate and is only requested from **Upload now**.
The token stays in memory for about an hour and is never written into the log or a backup.

Until the Google Cloud project below is done, **Upload now** signs in and then shows a plain reason (API not turned
on, permission missing, no channel, or the daily limit). The entry stays on the phone either way.

Do this once, in the same Google Cloud project that owns the Drive client:

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select that project.
2. **APIs & Services → Library**. Search for **YouTube Data API v3**. **Enable** it.
3. **APIs & Services → OAuth consent screen**. Open **Data access** (Google sometimes labels this **Scopes**).
   **Add or remove scopes**. Add `https://www.googleapis.com/auth/youtube.upload`. Save.
4. Leave the app on **Testing**. Open **Audience** (or **Test users**) and add the Gmail address that owns the
   YouTube channel. Only those test users can grant this permission.
5. Do not create a new client. The existing web client already allows `https://eddie144-ai.github.io`. Upload from
   the published app. A desktop preview on localhost is not on that client, so Google will refuse it.
6. The Google account needs a YouTube channel. If the app says so, open [YouTube](https://www.youtube.com) while
   signed in as that account and create a channel, then try the upload again.

The first time, Google shows that the app isn't verified. `youtube.upload` is a sensitive scope. Choose
**Advanced**, then **Go to Iron & Eggs (unsafe)**. That is expected while the app stays in Testing. Leave it in
Testing for one person. Publishing the app to Production asks Google to verify the app, and an unverified
sensitive scope is blocked for anyone who isn't a test user.

Limits worth knowing:

- The default YouTube Data API quota is **10,000 units a day** for the project. Each upload (`videos.insert`)
  costs **1,600 units**, so about **6 uploads a day**. A higher quota is a separate request in the Cloud console
  and is not automatic.
- Testing mode allows up to 100 test users. This app does not store a refresh token. Sign-in lasts about an hour,
  then **Upload now** asks again.
- A video left on Private is not public. Unlisted and Public are only used when you pick them on the form.

## Files
`index.html` (page and styles), `data.js` (programmes, staples, recipes, methods, Mentzer levels and
techniques, from Iron & Eggs), `scan.js` (barcode lookup, name search and the scanner polyfill loader), `label.js` (on-phone nutrition-label reading, per 100 g parsing and scaling), `photos.js` (progress and meal photos), `foodai.js` (photo logging with Gemini or Claude), `share.js` (share cards and the share sheet), `coach.js` (the brief for Coach Mike and the parser for his reply), `drive.js` (optional Google Drive auto-backup), `session.js` (workout clock, rest timer and tempo), `diary.js` (cut diary: day count, YouTube text, and the clip database), `youtube.js` (optional YouTube upload), `cut.js` (milestones, weekly report, strength records, swaps and catch-up), `exercises.json` + `exercises-LICENSE.md` (exercise library), `app.js`, `bg.jpg`
(background photo), `sw.js`, `manifest.json`, `icons/`, `tests/app.test.mjs`, `tests/label.test.mjs`, `tests/session.test.mjs`, `tests/diary.test.mjs`, `tests/cut.test.mjs`, `tests/drive.test.mjs`, `tests/coach.test.mjs`.

## Tests
```bash
npm i playwright          # once, for the browser tests
node gym-fuel/tests/app.test.mjs
node --test gym-fuel/tests/label.test.mjs
node --test gym-fuel/tests/session.test.mjs
node --test gym-fuel/tests/diary.test.mjs
node --test gym-fuel/tests/cut.test.mjs
node --test gym-fuel/tests/drive.test.mjs
node --test gym-fuel/tests/coach.test.mjs
```
