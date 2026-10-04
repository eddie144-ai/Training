# Shredded System: Product Specification

For building or rebuilding the app in Claude Code, Grok or any other tool. A working reference build is in `../app/` (plain HTML, CSS and JavaScript, no build step). This spec describes that build and what a fuller version should add.

## 1. Purpose

Help one person cut from 95 kg to 70–75 kg using a Gironda-style diet, with Mentzer-style training as support. The app must:

1. Make the daily plan obvious: which day type, which meals, how much.
2. Make logging take under a minute (the user scores very low on conscientiousness; friction kills tracking).
3. Make the weekly decision from data, not mood.
4. Refuse unsafe advice: no dehydration, raw animal foods, extreme calories or medication dosing.

## 2. Users and constraints

- One user, on an Android phone, often offline.
- Data stays on the device (localStorage in the reference build). Export to JSON and CSV.
- Runs next to the Trainer app on the same site and can import its weights, steps and sleep (`localStorage['trainer.v1']`).
- UK units and spelling. Metric only.

## 3. Data sources (single source of truth)

| File | Contents |
|---|---|
| `data/foods.csv` | Per-100 g values: kcal, protein, fat, carbs, fibre, saturated fat; optional unit size (egg = 50 g). |
| `data/meal-templates.csv` | Day templates (strict, cut, modern, carbup) → meals → food and grams. |
| `data/workout-templates.csv` | Full Body A and B: exercise, sets, rep range, target RIR. |
| `data/decision-rules.json` | Weekly rules, guardrails, red-flag symptoms. |
| `templates/*.csv` | Column layouts for daily log, workout log and weekly check-in exports. |

`tools/build.mjs` turns these into `app/data.js`. Never hard-code foods or rules in app logic.

## 4. Data model

```ts
type State = {
  v: 1;
  profile: { sex: 'male'|'female'; age: number|null; height: number|null; startWeight: number; startDate: string; goalLow: number; goalHigh: number; activity: number; bf: number|null };
  targets: { kcal: number|null /* null = auto */; protein: number; fat: number; carbs: number; fibre: number };
  carbupHours: 72|96|120;
  trainDays: number[];             // 0 = Sunday
  days: Record<string /* YYYY-MM-DD */, Day>;
  workouts: { id: string; date: string; tpl: 'A'|'B'; sets: { kg: number|null; reps: number|null; rir: number|null }[][] }[];
  plan: Record<'cut'|'strict'|'modern'|'carbup', number>;  // days per week for the shopping list
};
type Day = {
  type?: 'cut'|'strict'|'modern'|'carbup';   // unset = suggested
  meals?: Record<number, boolean>;            // template meal n eaten
  extra?: { id: string; name: string; kcal: number; p: number; f: number; c: number; fib: number; sat: number }[];
  weight?: number; waist?: number; water?: number; steps?: number; sleep?: number;
  veg?: boolean; alcohol?: boolean; hunger?: 1|2|3|4|5; energy?: 1|2|3|4|5;
  symptoms?: string[]; med?: string; note?: string;
};
```

## 5. Screens

| Screen | Contents |
|---|---|
| **Header** | 7-day average weight, kg lost, % per week, hours to next carb-up. Setup button. |
| **Today** | Day navigator; day-type switch with suggestion; carb-up clock; template meals as one-tap cards; off-plan entry (food + grams, or free text + kcal); macro bars against targets (kcal, protein, fat, carbs, fibre) with saturated-fat and fibre warnings; scaling hint; check-in (weight, waist, steps, sleep, water stepper, greens, alcohol, hunger, energy, symptoms, medication note, note). Red-flag panel at the top when a red symptom is ticked. |
| **Food** | Each template with meals, grams and macros; weekly shopping list from day counts; food table. |
| **Train** | A/B session logger (kg, reps, RIR per set) with last session shown and an "add weight" hint; history with a strength score. |
| **Progress** | Weight chart (daily dots, 7-day average, goal band, projection); weekly decision with its inputs; timeline to 90/85/80/75/72.5/70 kg; body-fat calculator for the target weight; weekly table. |
| **Guide** | Short guide, links to the PDFs, rules, red flags, medication policy. |
| **Setup** | Profile, targets, carb-up interval, training days, Trainer import, exports, restore, reset. |

## 6. Rules and formulas

**Suggested day type** (first match): before the start date → strict (baseline); carb-up clock due → carbup; training day or a session logged → modern; else cut.

**Carb-up clock:** hours from midday of the last carb-up day (or the day before the start date). Due when hours ≥ interval − 12.

**Maintenance:**
- Estimated: Mifflin-St Jeor BMR × activity (1.2 / 1.375 / 1.55 / 1.725).
- Measured (preferred, needs 14 logged days and 8 weigh-ins within the last 28 days): mean intake + (first-4 mean − last-4 mean) × 7,700 ÷ days spanned.

**Targets:** low day = maintenance − 500, rounded to 25, never below the floor (1,500 men / 1,200 women); 1,900 if unknown. Carb-up = maintenance, fat 45 g, carbs = (kcal − 4P − 9F) ÷ 4, at least 150 g. Training day: carbs 130 g, fat reduced by 20 g (min 45).

**On plan:** every template meal ticked, no extras, no alcohol. Today stays undecided until finished or broken.

**Trend:** rate % = (mean weigh-ins in days −13..−7 − mean in −6..0) ÷ earlier mean × 100; needs 3+ weigh-ins in each window.

**Strength down:** the last two sessions of the same template each scored lower than the one before (score = sum of the best Epley e1RM per exercise, kg × (1 + reps ÷ 30)).

**Weekly decision:** `data/decision-rules.json`, in order. Needs 12 complete days (weight + food) in the last 14.

**Projection:** weekly rate = measured rate (capped at 1%) or 0.8% by default, × 0.8 below 85 kg and × 0.6 below 78 kg.

## 7. Guardrails (must not be removable by the user)

- Never output a calorie target below the floor without a warning that a clinician is needed.
- Never output dosing, timing, escalation or sourcing for any medication. The medication field is a free-text record only.
- Red-flag symptoms always show the matching advice at the top of Today.
- No content suggesting dehydration, water or sodium manipulation, diuretics, laxatives, raw eggs, raw meat or raw milk.
- Warn if the goal weight is a BMI under 20 at the entered height.

## 8. Acceptance tests

1. Fresh install shows the welcome note, the baseline-week panel before the start date and the strict template.
2. Ticking every meal of the Cut template shows 1,678 kcal and 187 g protein.
3. With 20 days of logs losing 0.12 kg/day, the decision is "On track" and maintenance is measured, not estimated.
4. Ticking "Severe tummy pain" shows the red-flag panel; unticking removes it.
5. Setting low-day calories to 1,200 (male) shows the floor warning.
6. A session saved on Full Body A appears in history and sets the day type to Training.
7. Daily-log CSV export has exactly the columns in `templates/daily-log.csv`.
8. Restore rejects anything that isn't `{ v: 1, days: {...} }`.
9. Works offline after the first load (service worker), and as the single-file copy opened from disk.

## 9. Next features (not in the reference build)

- **Garmin sync:** Garmin's Health API needs a registered developer account and a server. Route it through the existing `n8n/telemetry-ingest` workflow into a small store the app can read, or keep manual entry.
- **Photo log:** monthly front/side/back photos stored on the device (IndexedDB).
- **Barcode scanning** for off-plan foods (Open Food Facts).
- **Shared Trainer data model,** so Trainer, Life RPG and Shredded System write one log.
- **Reminders:** morning weigh-in and carb-up-due notifications (needs a PWA notification permission).

## 10. Build prompt

Paste this into Claude Code or Grok with this folder attached:

> Build the Shredded System app described in `app-spec/product-spec.md`. Use the data in `data/` as the only source of foods, meal templates, workouts and decision rules, and keep the guardrails in section 7 exactly. Target: an offline-first Android PWA, plain HTML/CSS/JS with no build step (or React if you prefer, but keep the data files canonical). The reference build in `app/` already passes the acceptance tests in section 8; keep its behaviour and improve on it. Ask me anything that isn't clear before you start.
