'use strict';
/* Trainer: built-in content (programs, recipes, stacks, goals, prompts).
   Everything here is a starting template; the app copies programs into your own
   data on first run so you can edit them without losing the originals. */

// ---------------------------------------------------------------------------
// Training programs
// family: 'cycle' = the 4-week volume cycle, 'hit' = Mike Mentzer high intensity
// ss: true = superset with the NEXT exercise, no rest between
// tech: advanced technique id from TECHNIQUES (changes how sets are logged)
// weeks: which weeks of the cycle a day belongs to (used to suggest the next day)
// restDays: [min, max] days between sessions for HIT programs
// tier: beginner | intermediate | advanced (HIT programs only)
// ---------------------------------------------------------------------------
const ex = (name, sets, reps, note = '', ss = false, tech = '') => ({ name, sets, reps, note, ss, tech });

const PROGRAM_TEMPLATES = [
  {
    id: 'my4week', family: 'cycle', name: 'My 4-Week Program', version: 2,
    source: 'Your plan',
    about: 'Phase 1 (weeks 1–2) builds a strength base at 6–8 reps. Phase 2 (weeks 3–4) is hypertrophy volume at 10–12, with a different arm rotation on Day 4 in week 3 and week 4.',
    days: [
      { name: 'Day 1 · Chest & Triceps', group: 'Phase 1 · Weeks 1–2', weeks: [1, 2], exercises: [
        ex('Reverse Grip Bench Press', 4, '6–8'), ex('V-Bar Dumbbell Chest Press', 4, '6–8'),
        ex('2x Dumbbell Pullover into Chest Press', 4, '6–8'), ex('Close Grip Bench Press', 4, '6–8'),
        ex('Lying Tricep Zottman Curls', 3, '8–10'), ex('Lat Machine Tricep Pulldown', 3, '8–10')] },
      { name: 'Day 2 · Legs, Calves & Abs', group: 'Phase 1 · Weeks 1–2', weeks: [1, 2], exercises: [
        ex('Barbell Squat', 3, '6–8'), ex('Leg Press', 4, '6–8'), ex('Romanian Deadlift', 4, '6–8'),
        ex('Standing Calf Raise', 3, '20'), ex('Leg Curl Machine for Lower Abs', 3, '15–20', 'Pad-resistance reverse crunches'),
        ex('Barbell Plate Lying Side Twists', 3, '15/side')] },
      { name: 'Day 3 · Shoulders & Traps', group: 'Phase 1 · Weeks 1–2', weeks: [1, 2], exercises: [
        ex('Straight Arm Shoulder Raises', 4, '6–8', 'Standing or seated'), ex('Arnold Press', 4, '6–8'),
        ex('Barbell Upright Row', 4, '6–8'), ex('Shrugs', 3, '6–8')] },
      { name: 'Day 4 · Back, Biceps & Abs', group: 'Phase 1 · Weeks 1–2', weeks: [1, 2], exercises: [
        ex('Barbell Deadlift', 3, '6–8'), ex('Barbell Bent-Over Row', 4, '6–8'), ex('Spider Curls', 4, '12–15'),
        ex('Dumbbell Preacher Curls (Pinkie Inwards)', 3, '8–10'), ex('Dumbbell Hammer Concentration Curls', 3, '8–10'),
        ex('Seated Zottman Curls', 3, '8–10')] },
      { name: 'Day 1 · Chest & Triceps', group: 'Phase 2 · Weeks 3–4', weeks: [3, 4], exercises: [
        ex('Reverse Grip Bench Press', 4, '10–12'), ex('V-Bar Dumbbell Chest Press', 4, '10–12'),
        ex('2x Dumbbell Pullover into Chest Press', 4, '10–12'), ex('Close Grip Bench Press', 4, '10–12'),
        ex('Lying Tricep Zottman Curls', 3, '10–12'), ex('Tricep Pressdown (Elbows 180°)', 3, '10–12'),
        ex('Close Grip Cable Tricep Pressdown', 3, '10–12')] },
      { name: 'Day 2 · Legs, Calves & Abs', group: 'Phase 2 · Weeks 3–4', weeks: [3, 4], exercises: [
        ex('Barbell Squat', 3, '10–12'), ex('Leg Press', 4, '10–12'), ex('Romanian Deadlift', 4, '10–12'),
        ex('Standing Calf Raise', 3, '20'), ex('Leg Curl Machine for Lower Abs', 3, '15–20', 'Pad-resistance reverse crunches'),
        ex('Barbell Plate Lying Side Twists', 3, '15/side')] },
      { name: 'Day 3 · Shoulders & Traps', group: 'Phase 2 · Weeks 3–4', weeks: [3, 4], exercises: [
        ex('Straight Arm Shoulder Raises', 4, '10–12', 'Standing or seated'), ex('Arnold Press', 4, '10–12'),
        ex('Barbell Upright Row', 4, '10–12'), ex('Shrugs', 3, '10–12')] },
      { name: 'Day 4 · Back, Biceps & Abs (week 3 arms)', group: 'Phase 2 · Weeks 3–4', weeks: [3], exercises: [
        ex('Barbell Deadlift', 3, '10–12'), ex('Barbell Bent-Over Row', 4, '10–12'),
        ex('Cross Body Hammer Curls', 4, '10–12', 'Hard squeeze'), ex('Dumbbell Hammer Concentration Curls', 3, '10–12'),
        ex('Preacher Open-Palmed DB Curls', 3, '10–12'), ex('Cable Drag Curl into Full Curl', 3, '10–12')] },
      { name: 'Day 4 · Back, Biceps & Abs (week 4 arms)', group: 'Phase 2 · Weeks 3–4', weeks: [4], exercises: [
        ex('Barbell Deadlift', 3, '10–12'), ex('Barbell Bent-Over Row', 4, '10–12'),
        ex('Drag Curls', 4, '10–12'), ex('Dumbbell Hammer Concentration Curls', 3, '10–12'),
        ex('One-Arm Bicep Pulldown', 3, '10–12'), ex('Leaning Against the Wall Curls', 3, '10–12')] },
    ],
  },
  {
    id: 'tenlbs', family: 'cycle', name: '10 lbs of Muscle in 4 Weeks',
    source: 'Your "10lbs Of Muscle In 4 Weeks" notebook',
    about: 'The original program. * and ** are the markers from your notebook.',
    days: [
      { name: 'Workout 1 · Chest & Triceps', group: 'Weeks 1–2', weeks: [1, 2], exercises: [
        ex('Incline Barbell Press', 3, '6–8', '*'), ex('Flat-Bench Dumbbell Press', 4, '6–8'), ex('Weighted Dip', 4, '6–8'),
        ex('Close-Grip Bench Press', 4, '6–8', '*'), ex('Lying Triceps Extension', 3, '6–8')] },
      { name: 'Workout 2 · Legs, Calves & Abs', group: 'Weeks 1–2', weeks: [1, 2], exercises: [
        ex('Smith Machine Squat', 3, '6–8', '*'), ex('Leg Press', 4, '6–8'), ex('Hack Squat', 4, '6–8'),
        ex('Romanian Deadlift', 4, '6–8', '*'), ex('Standing Calf Raise', 3, '20', '*'),
        ex('Hanging Leg Raise', 2, '20'), ex('Cable Crunch', 2, '20')] },
      { name: 'Workout 3 · Shoulders & Traps', group: 'Weeks 1–2', weeks: [1, 2], exercises: [
        ex('Overhead Dumbbell Press', 3, '6–8', '*'), ex('Arnold Press', 4, '6–8'), ex('Barbell Upright Row', 4, '6–8'),
        ex('Bent-Over Lateral Raise', 4, '6–8'), ex('Dumbbell Shrug', 3, '6–8')] },
      { name: 'Workout 4 · Back, Biceps & Abs', group: 'Weeks 1–2', weeks: [1, 2], exercises: [
        ex('Deadlift', 3, '6–8', '*'), ex('Barbell Bent-Over Row', 4, '6–8'), ex('T-Bar Row', 4, '6–8'),
        ex('Barbell Curl', 4, '6–8', '*'), ex('Incline Dumbbell Curl', 4, '6–8'), ex('Preacher Curl', 3, '6–8'),
        ex('Crunch', 2, '20'), ex('Reverse Crunch', 2, '20')] },
      { name: 'Workout 1 · Chest & Back', group: 'Weeks 3–4', weeks: [3, 4], exercises: [
        ex('Dumbbell Flye', 3, '10–12', '*'), ex('Bench Press', 3, '10–12', '*'), ex('Incline Dumbbell Press', 3, '10–12'),
        ex('Cable Crossover', 3, '10–12', '**'), ex('Rack Pull', 3, '10–12', '*'), ex('Lat Pulldown', 3, '10–12', '*'),
        ex('One-Arm Dumbbell Row', 3, '10–12'), ex('Wide-Grip Seated Row', 3, '10–12')] },
      { name: 'Workout 2 · Legs, Calves & Abs', group: 'Weeks 3–4', weeks: [3, 4], exercises: [
        ex('Leg Extension', 3, '10–12', '* **'), ex('Barbell Squat', 3, '10–12', '*'), ex('Leg Press', 3, '10–12'),
        ex('Hack Squat', 3, '10–12'), ex('Romanian Deadlift', 3, '10–12', '*'), ex('Lying Leg Curl', 3, '10–12', '**'),
        ex('Seated Calf Raise', 3, '10–12', '*'), ex('Donkey Calf Raise', 3, '10–12', '**'),
        ex('Reverse Crunch', 2, '12'), ex('Hanging Knee Raise', 2, '12'), ex('Double Crunch', 2, 'to failure')] },
      { name: 'Workout 3 · Shoulders & Traps', group: 'Weeks 3–4', weeks: [3, 4], exercises: [
        ex('Cable Lateral Raise', 3, '10–12', '* **'), ex('Arnold Press', 3, '10–12', '*'), ex('Smith Machine Overhead Press', 3, '10–12'),
        ex('Leaning Dumbbell Lateral Raise', 3, '10–12'), ex('Reverse Pec-Deck Flye', 3, '10–12', '**'),
        ex('Dumbbell Shrug', 3, '10–12', '**'), ex('Incline Dumbbell Shrug', 3, '10–12')] },
      { name: 'Workout 4 · Arms & Abs', group: 'Weeks 3–4', weeks: [3, 4], exercises: [
        ex('Lying Barbell Extension', 3, '10–12', '*'), ex('Weighted Bench Dip', 3, '10–12'), ex('Reverse-Grip Pressdown', 3, '10–12'),
        ex('Close-Grip EZ-Bar Curl', 3, '10–12', '*'), ex('Cable Preacher Curl', 3, '10–12', '**'), ex('Hammer Curl', 3, '10–12'),
        ex('Hanging Leg Raise', 2, '20'), ex('Double Crunch', 2, '20')] },
    ],
  },
  {
    id: 'mentzer_ab', family: 'hit', tier: 'intermediate', name: 'Mentzer A/B', restDays: [4, 7],
    source: 'Your Trainer plan',
    about: 'Two alternating sessions. One all-out set to positive failure per exercise after warm-ups.',
    days: [
      { name: 'Day A · Chest / Back / Delts', exercises: [
        ex('Pec Deck / Flyes', 1, '6–10', 'Pre-exhaust', true), ex('Incline Press', 1, '3–5', 'Straight from pec deck'),
        ex('Pullover / Pulldown', 1, '6–10'), ex('Row', 1, '6–10'), ex('Lateral Raise', 1, '6–10')] },
      { name: 'Day B · Legs / Arms', exercises: [
        ex('Leg Extension', 1, '12–20', 'Pre-exhaust', true), ex('Leg Press / Squat', 1, '12–20', 'Straight from leg extension'),
        ex('Leg Curl', 1, '12–20'), ex('Calf Raise', 1, '12–20'), ex('Curl', 1, '6–10'), ex('Tricep Extension', 1, '6–10')] },
    ],
  },
  {
    id: 'mim_ideal', family: 'hit', tier: 'intermediate', name: 'Ideal Routine (Muscle in Minutes)', restDays: [5, 7],
    source: 'Mike Mentzer, Muscle in Minutes, "The Ideal Routine"',
    about: 'Four workouts, each 5–7 days after the last. 6–10 reps; incline presses and dips 3–5 when they follow a superset; legs and abs 12–20.',
    days: [
      { name: 'Workout 1 · Chest & Back', exercises: [
        ex('Dumbbell Flyes, Crossovers or Pec Deck', 1, '6–10', 'Superset', true), ex('Incline Presses', 1, '3–5'),
        ex('Close-Grip, Palms-Up Pulldowns', 1, '6–10'), ex('Deadlifts (or Shrugs)', 1, '6–10')] },
      { name: 'Workout 2 · Legs', exercises: [
        ex('Leg-Extensions', 1, '12–20', 'Superset', true), ex('Leg Presses', 1, '12–20'),
        ex('Standing Calf Raises', 1, '12–20'), ex('Sit-Ups', 1, '12–20')] },
      { name: 'Workout 3 · Shoulders & Arms', exercises: [
        ex('Dumbbell Laterals', 1, '6–10'), ex('Bent-Over Dumbbell Laterals', 1, '6–10'), ex('Barbell Curls', 1, '6–10'),
        ex('Tricep Pressdowns', 1, '6–10', 'Superset', true), ex('Dips', 1, '3–5')] },
      { name: 'Workout 4 · Legs', exercises: [
        ex('Leg-Extensions', 1, '12–20', 'Superset', true), ex('Squats (or Leg Presses)', 1, '12–20'),
        ex('Standing Calf Raises', 1, '12–20'), ex('Sit-Ups', 1, '12–20')] },
    ],
  },
  {
    id: 'hd_ideal', family: 'hit', tier: 'intermediate', name: 'Heavy Duty Principled Routine', restDays: [1, 3],
    source: 'Mike Mentzer, Heavy Duty, "The Ideal (or Principled) Routine"',
    about: 'Train every other day; after each 3-day cycle take two days off. 6–10 reps to positive failure; add 10–20% weight when you reach 12.',
    days: [
      { name: 'Day 1 · Chest, Delts & Triceps', exercises: [
        ex('Dumbbell Flyes, Cable Cross or Pec Deck', 1, '6–10', 'Superset', true), ex('Incline Presses', 1, '6–10'),
        ex('Laterals', 1, '6–10'), ex('Bent-Over Dumbbell Laterals', 1, '6–10'),
        ex('Lying French Presses, Pressdowns or Triceps Machine', 1, '6–10', 'Superset', true), ex('Dips', 1, '6–10')] },
      { name: 'Day 2 · Back & Biceps', exercises: [
        ex('Pullovers', 1, '6–10', 'Superset', true), ex('Close-Grip, Palms-Up Pulldowns', 1, '6–10'),
        ex('Bent-Over Barbell Rows', 1, '6–10'), ex('Shrugs', 1, '6–10'),
        ex('Hyperextensions or Deadlifts', 1, '6–10'), ex('Curls', 1, '6–10')] },
      { name: 'Day 3 · Legs', exercises: [
        ex('Leg Extensions', 1, '6–10', 'Superset', true), ex('Leg Presses or Squats', 1, '6–10', 'Alternate workout to workout'),
        ex('Leg Curls', 1, '6–10'), ex('Calf Raises', 1, '6–10')] },
    ],
  },
  {
    id: 'mim_breakin', family: 'hit', tier: 'beginner', name: '5-Day Break-in', restDays: [1, 2],
    source: 'Mike Mentzer, Muscle in Minutes',
    about: 'Days 1–3: stop about 3 reps short of failure. Day 4: stop about 2 short. Day 5: first set to momentary failure. Then rest 4–5 days before the Ideal Routine.',
    days: [
      { name: 'Break-in session', exercises: [
        ex('Machine or Barbell Squats', 1, '10–12'), ex('Leg Curls', 1, '10–12'), ex('Standing Calf Raises', 1, '10–12'),
        ex('Rows', 1, '10–12'), ex('Shrugs', 1, '10–12'), ex('Bench Presses', 1, '10–12'),
        ex('Machine or Barbell Curls', 1, '10–12'), ex('Triceps Pressdowns', 1, '10–12'), ex('Sit-ups', 1, '10–12')] },
    ],
  },
  {
    id: 'mim_athlete', family: 'hit', tier: 'beginner', name: "Athlete's Routine", restDays: [5, 7],
    source: 'Mike Mentzer, Muscle in Minutes',
    about: 'Two compound workouts 5–7 days apart; the least exercise that stimulates the whole body. Good when recovery is poor.',
    days: [
      { name: 'Workout 1', exercises: [ex('Deadlifts', 1, '5–8'), ex('Dips', 1, '6–10')] },
      { name: 'Workout 2', exercises: [ex('Squats', 1, '8–15'), ex('Close-Grip Pulldowns', 1, '6–10')] },
    ],
  },
  // ---- Advanced: consolidation routines and advanced techniques ----------
  {
    id: 'hd2_consol', family: 'hit', tier: 'advanced', name: 'Consolidation Routine (1996)', restDays: [4, 7],
    source: 'Mike Mentzer, Heavy Duty II: Mind and Body (1996), via The Wisdom of Mike Mentzer',
    about: 'One set of each exercise to failure. Rest 4–7 days between workouts. As you grow stronger, add an extra rest day or two at random.',
    days: [
      { name: 'Workout One', exercises: [
        ex('Squats', 1, '12–20', 'Alternate periodically with leg presses'), ex('Close-Grip, Palms-Up Pulldowns', 1, '6–10'), ex('Dips', 1, '6–10')] },
      { name: 'Workout Two', exercises: [
        ex('Deadlifts', 1, '6–10', 'Alternate periodically with shrugs'), ex('Presses Behind Neck', 1, '6–10')] },
    ],
  },
  {
    id: 'consol_1998', family: 'hit', tier: 'advanced', name: 'Consolidation Routine (1998)', restDays: [4, 7],
    source: 'Mike Mentzer (1998), via The Wisdom of Mike Mentzer',
    about: 'Mentzer cut it to the fewest exercises that cover every major muscle group without overlap. One set to failure each, 4–7 days apart. Reps are from his two-set version for very strong or hard-gaining trainees: for that version, drop the calf raises.',
    days: [
      { name: 'Workout One', exercises: [ex('Deadlifts', 1, '5–8'), ex('Dips', 1, '6–10')] },
      { name: 'Workout Two', exercises: [ex('Squats', 1, '8–15'), ex('Close-Grip, Palms-Up Pulldowns', 1, '6–10'), ex('Standing Calf Raises', 1, '12–20')] },
    ],
  },
  {
    id: 'hitway_ideal', family: 'hit', tier: 'advanced', name: 'Ideal (Principled) Workout', restDays: [4, 7],
    source: 'Mike Mentzer, High-Intensity Training the Mike Mentzer Way, ch. 13',
    about: 'Isolation straight into compound, no rest. Take your time learning the weights at first (up to 30 minutes); work towards 10–12 minutes. Rest 4–7 days after each workout. Workout One is from the chapter you sent; add the others with Edit.',
    days: [
      { name: 'Workout One · Chest & Back', exercises: [
        ex('Dumbbell Flyes', 1, '6–10', 'Lower to just below the torso, no further', true),
        ex('Incline Presses', 1, '1–3', 'Shoulder-width grip, elbows out, bar to the neck'),
        ex('Straight-Arm Lat Machine Pulldowns', 1, '6–10', 'Arms straight; pause at the thighs', true),
        ex('Palms-Up Pulldowns', 1, '6–10', 'Add weight, underhand grip, pull to the chest and pause'),
        ex('Deadlifts', 1, '6–10', 'Back flat, head up, no jerking; reset each rep')] },
    ],
  },
  {
    id: 'hd_advanced', family: 'hit', tier: 'advanced', name: 'Advanced Heavy Duty', restDays: [4, 7],
    source: 'Built from The Wisdom of Mike Mentzer, ch. 5 (Rest-Pause, Omni-Contraction, Static Holds)',
    about: 'A template that puts each advanced method where Mentzer used it. At most one advanced set per body part. Mentzer advised against running these methods for more than 4–6 weeks at a time.',
    days: [
      { name: 'Workout A · Chest & Back', exercises: [
        ex('Pec Deck', 1, '6–10', 'To positive failure, then straight into the press', true, 'failhold'),
        ex('Incline Presses', 1, '4 singles', 'Rest-Pause', false, 'restpause'),
        ex('Close-Grip, Palms-Up Pulldowns', 1, '8–12 s hold', 'Static hold at full contraction', false, 'hold'),
        ex('Deadlifts', 1, '6–10')] },
      { name: 'Workout B · Legs & Shoulders', exercises: [
        ex('Leg Extensions', 1, '15–30 s hold', 'Static hold at full contraction', false, 'hold'),
        ex('Leg Press', 1, '4 singles', 'Omni-Contraction', false, 'omni'),
        ex('Leg Curls', 1, '15–30 s hold', '', false, 'hold'),
        ex('Machine Lateral Raises', 1, '8–12 s hold', '', false, 'hold'),
        ex('Standing Calf Raises', 1, '15–30 s hold', '', false, 'hold'),
        ex('Dips', 1, '4 singles', 'Infitonic: partner adds pressure on the way down', false, 'infitonic')] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Food
// kcal/p/c/f are PER SERVING. `serves` = servings the whole recipe makes.
// Dolce macros are estimates from standard food-composition values for the
// ingredients as written (optional items left out unless noted).
// ---------------------------------------------------------------------------
const STAPLES = [
  { id: 'gironda1', name: 'Gironda Meal 1: 6 eggs + 3 Lidl pork patties', kcal: 933, p: 77, c: 4, f: 66, serves: 1, quest: 'meal1', note: 'Your macros' },
  { id: 'gironda2', name: 'Gironda Meal 2: 6 eggs + 250 g steak', kcal: 952, p: 93, c: 2.5, f: 61, serves: 1, quest: 'meal2', note: 'Your macros' },
  { id: 'dplate_b', name: 'Dolce plate: breakfast (protein + veg)', kcal: 400, p: 40, c: 25, f: 15, serves: 1, note: 'Protein target from your plan; carbs/fat rough' },
  { id: 'dplate_l', name: 'Dolce plate: lunch (lean protein + greens)', kcal: 450, p: 45, c: 30, f: 15, serves: 1, note: 'Protein target from your plan; carbs/fat rough' },
  { id: 'dplate_d', name: 'Dolce plate: dinner (protein + veg)', kcal: 500, p: 50, c: 35, f: 17, serves: 1, note: 'Protein target from your plan; carbs/fat rough' },
  { id: 'dplate_s', name: 'Dolce snack (high protein)', kcal: 200, p: 25, c: 10, f: 6, serves: 1, note: 'Protein target from your plan; carbs/fat rough' },
];

const r = (id, name, meal, tags, serves, kcal, p, c, f, ingredients, method, note = '') =>
  ({ id, name, meal, tags, serves, kcal, p, c, f, ingredients, method, note });

const RECIPES = [
  // Breakfast
  r('breakfast_bowl', 'Breakfast Bowl', 'Breakfast', 'AHGV', 1, 528, 16, 109, 15,
    ['½ cup oat bran or buckwheat', '1 cup blueberries', '½ cup strawberries', '¼ cup raisins', '½ banana, sliced', '1 tbsp natural peanut or almond butter', '1 tbsp ground flax seeds', 'Pinch of cinnamon', '1 cup water'],
    'Simmer the oat bran and berries in the boiled water, stirring, until thick. Stir in flax, raisins and cinnamon; top with nut butter and banana.',
    'High carb: a training-day breakfast.'),
  r('pitbull_pancakes', 'Pitbull Pancakes', 'Breakfast', 'AHGV', 2, 336, 9, 38, 16,
    ['1 cup brown-rice pancake mix (e.g. Pamela\'s)', '1 egg (or flax egg)', '¾ cup water', '1 tbsp coconut oil'],
    'Make the batter per the packet; cook in coconut oil. Serve with Fresh Berry Syrup.'),
  r('east_coast_toast', 'East Coast Breakfast Toast', 'Breakfast', 'AHGV', 1, 282, 14, 30, 11,
    ['1 egg', '¼ cup almond milk', '2 slices bread', 'Coconut oil', 'Dash of cinnamon'],
    'Beat egg and milk, soak the bread, brown both sides in coconut oil over low heat. Top with cinnamon or fruit.'),
  r('berry_syrup', 'Fresh Berry Syrup', 'Breakfast', 'AHGV', 4, 48, 0.5, 12, 0.2,
    ['4 oz water', '1 cup strawberries', '1 cup blueberries', '1 tbsp agave (optional)'],
    'Soften the fruit in the water over low heat, mash, stir in agave.'),
  r('oats_smoothie', 'Oats & Berries Smoothie', 'Breakfast', 'AHGV', 1, 457, 13, 113, 6,
    ['1 cup blueberries', '1 cup strawberries', '1 orange', '1 banana', '½ cup uncooked oat bran or buckwheat', '½ cup almond milk', '1 tsp honey', '10 ice cubes'],
    'Blend until creamy.', 'High carb: best after training.'),
  // Lunch
  r('salmon_salad', 'Salmon Salad', 'Lunch', 'AHG', 2, 345, 23, 22, 18,
    ['1 can wild Alaskan sockeye', '½ celery stalk, chopped', '¼ cup red or sweet onion', '2 tsp spicy mustard or horseradish', '2 tbsp unsweetened dill relish', '¼ tsp black pepper', '7 black olives (optional)', '½ avocado', 'Brown rice wrap or bread'],
    'Mash everything with the salmon and avocado; serve in a wrap or on bread.'),
  r('chickpea_salad', 'Chick Pea Salad', 'Lunch', 'AHGV', 3, 458, 14, 27, 34,
    ['6 oz chickpeas', 'Handful baby spinach', 'Handful kale', '½ cucumber', '¼ onion', '½ tomato or 6 cherry tomatoes', '½ cup walnuts', '6 strawberries', '4 oz feta (optional, included)', '3 tbsp extra virgin olive oil', '3 tbsp balsamic vinegar'],
    'Combine and dress with olive oil and balsamic.', 'Fat-heavy from walnuts, feta and oil: halve the oil on a cut.'),
  r('egg_salad', 'Egg Salad', 'Lunch', 'AHG', 2, 308, 18, 21, 18,
    ['4 hard-boiled eggs', '¼ onion', 'Sea salt and pepper', '½ avocado', 'Bread or wrap'],
    'Chop and mash the eggs with onion, seasoning and avocado. Serve on bread, in a wrap or over salad.'),
  r('tuna_salad', 'Tuna Salad', 'Lunch', 'AHG', 1, 446, 46, 17, 22,
    ['1 can tuna in water', '¼ onion', '½ celery stalk', '½ avocado', '1–2 tbsp spicy brown mustard', '1 tbsp sweet relish', '1 hard-boiled egg'],
    'Mix everything together. Serve over greens (macros exclude bread).', 'Cut-friendly.'),
  r('supafly_chicken', 'Supafly Chicken Salad', 'Lunch', 'AHG', 2, 506, 35, 45, 22,
    ['8 oz chicken breast, bite-sized', '½ celery stalk', '1 cup grapes, halved', '1 cup chickpeas', '1 avocado', '1 tsp lemon juice', 'Salt and pepper'],
    'Cook the chicken in a little grapeseed oil, cool, then mash together with the rest. Chill.'),
  r('omelette', 'Omelette', 'Lunch', 'AHG', 1, 598, 36, 42, 33,
    ['3 eggs', '¼ red pepper', '¼ onion', '¼ cup almond milk', '1 cup mushrooms', 'Handful spinach', '1 slice Havarti (optional, included)', '⅓ avocado on 2 slices toast'],
    'Sauté the veg, pour the egg and milk into a second pan and cook without stirring; flip, fill, fold. Serve with avocado toast.',
    'Skip the toast to save about 160 kcal.'),
  r('egg_scramble', 'Egg Scramble', 'Lunch', 'AHG', 1, 588, 36, 41, 32,
    ['3 eggs', '¼ red pepper', '¼ onion', '1 cup mushrooms', 'Handful spinach', '1 slice white cheese (optional, included)', '⅓ avocado on 2 slices toast'],
    'Sauté peppers and onion, add mushrooms then spinach, pour in eggs and scramble. Stir in cheese.',
    'Skip the toast to save about 160 kcal.'),
  r('strawberry_salad', 'Strawberry Salad', 'Lunch', 'AHGV', 2, 500, 10, 18, 47,
    ['2 handfuls baby spinach', '10 strawberries', '½ avocado', '1 cup walnuts', 'Light drizzle of olive oil and balsamic'],
    'Arrange and dress lightly.', 'Very high fat (a full cup of walnuts). Use ¼ cup on a cut.'),
  r('pasta_salad', 'Pasta Salad with Veggies', 'Lunch', 'AHGV', 2, 446, 19, 62, 14,
    ['2 cups cooked rotini (or gluten-free)', '1 cup steamed broccoli', '1 cup chickpeas', '⅓ cup mozzarella (optional, included)', '1 clove garlic', '½ tomato', 'Light olive oil and balsamic'],
    'Toss together, chill, dress and add cheese to serve.'),
  r('spinach_salad', 'Simple Spinach Salad', 'Lunch', 'AHGV', 1, 100, 1.5, 14, 4.7,
    ['Handful fresh spinach', 'Handful chopped coloured vegetable', 'Handful chopped fruit', 'Light hemp oil and apple cider vinegar'],
    'Mix and dress.', 'Dolce\'s weight-cut meal: light but keeps energy up.'),
  r('waldorf_salad', 'Waldorf Salad', 'Lunch', 'AHG', 4, 238, 6, 35, 11,
    ['½ cup walnuts', '½ cup plain yogurt', '2 tbsp avocado', '2 tbsp parsley', '1 tsp honey', '2 large apples', '2 celery stalks', '¼ cup raisins', '½ lemon, juiced', '1 head romaine'],
    'Mix yogurt, avocado, parsley, honey and pepper; toss with apples, celery, raisins and lemon. Add walnuts and lettuce to serve.'),
  // Dressings
  r('oil_vinegar', 'Oil & Vinegar Dressing', 'Dressing', 'AHGV', 1, 134, 0, 3, 14,
    ['1 tbsp extra virgin olive oil', '1 tbsp balsamic vinegar'], 'Whisk together. Per 1 tbsp each.'),
  r('natures_dressing', "Nature's Dressing", 'Dressing', 'AHGV', 1, 125, 0, 0, 14,
    ['1 tbsp hemp oil', '1 tbsp apple cider vinegar'], 'Whisk together. Per 1 tbsp each.'),
  r('grapeseed_pesto', 'Grapeseed Pesto', 'Dressing', 'AHGV', 8, 122, 0.1, 0.1, 13.6,
    ['1½ cups fresh basil', '½ cup grapeseed oil'], 'Grind the basil to a paste and stir in the oil. Serving = 1 tbsp.'),
  r('strawberry_vinaigrette', 'Strawberry Vinaigrette', 'Dressing', 'AHGV', 10, 104, 0.1, 1.9, 10.8,
    ['½ cup extra virgin olive oil', '½ pint strawberries', '2 tbsp balsamic', '½ tsp sea salt', '¼ tsp pepper'],
    'Blend until smooth. Serving = 2 tbsp.'),
  // Dinner
  r('chicken_asparagus', 'Chicken & Asparagus Stir Fry', 'Dinner', 'AHG', 2, 352, 49, 10, 12,
    ['2 chicken breasts', '1 bunch thin asparagus (~20 stalks)', '2 cloves garlic', '1 shallot', '2 tbsp low-sodium soy or teriyaki', 'Peanut oil'],
    'Steam the asparagus. Sauté shallot and garlic, add chicken until cooked, combine and season.', 'Cut-friendly.'),
  r('string_beans', 'Sautéed Garlic & Mushroom String Beans', 'Dinner', 'AHGV', 6, 80, 3.5, 13, 2.7,
    ['2 lb green beans', '9 large shiitake mushrooms', '4–5 cloves garlic', 'Grapeseed oil'],
    'Steam the beans. Sauté garlic and mushrooms, add beans and brown for 6–8 minutes.', 'Side dish.'),
  r('turkey_burgers', 'Turkey Burgers', 'Dinner', 'AHG', 2, 262, 26, 9, 15,
    ['½ lb lean turkey', '¼ cup oat bran or buckwheat', '1 egg', '2 cloves garlic', '1 tsp Worcestershire or teriyaki', 'Salt, pepper, oregano'],
    'Mix, shape 4–5 patties, cook 4–6 minutes a side. Serving = 2 patties, no bun.'),
  r('fighter_fajitas', 'Fighter Fajitas', 'Dinner', 'AHG', 4, 543, 37, 55, 20,
    ['1 lb chicken breast', '16 oz black beans', 'Chilli powder, cumin, salt, pepper', '8–12 tortillas', '1 avocado + lemon juice', '1 tomato', '¼ head lettuce', 'Cheddar (optional, not included)'],
    'Spice and cook the chicken, warm the tortillas, fill with chicken, beans and toppings. Serving = about 2–3 fajitas.'),
  r('honey_salmon', 'Honey Glazed Salmon', 'Dinner', 'AHG', 1, 401, 51, 17, 15,
    ['8 oz wild salmon', 'Grapeseed oil', 'Sea salt', 'Honey drizzle'],
    'Rub with oil and salt, cook 3–5 minutes a side, drizzle with honey.'),
  r('power_pasta', 'Power Pasta Sauce (with pasta & turkey)', 'Dinner', 'AHG', 6, 550, 28, 74, 17,
    ['16 oz pasta', '4 × 16 oz cans diced tomatoes', '1 red pepper', '1 green pepper', '1 sweet onion', '10–12 cloves garlic', 'Basil, oregano, salt', '16 oz ground turkey', 'Olive and grapeseed oil'],
    'Simmer the tomatoes with herbs; add sautéed veg and browned turkey. Serve over pasta.', 'Batch cook: 6 servings.'),
  r('portabella_chicken', 'Garlic Portabella Chicken with Asparagus & Spinach', 'Dinner', 'AHG', 1, 244, 26, 8, 12,
    ['½ chicken breast', '⅓ portabella mushroom', 'Handful baby spinach', '1 tbsp garlic', '6–8 asparagus stalks', 'Salt, oregano, pepper'],
    'Brown mushroom and garlic, wilt the spinach, add asparagus. Cook the seasoned chicken separately and combine.', 'Cut-friendly. Use a whole breast for about 50 g protein.'),
  r('sumo_stir_fry', 'Skinny Sumo Stir Fry', 'Dinner', 'AHG', 1, 441, 55, 22, 15,
    ['1 chicken breast', '2 cups broccoli', '1 cup mushrooms', '1 tbsp low-sodium soy', '4 green onions', 'Handful bean sprouts'],
    'Cook chicken in peanut oil; steam broccoli; brown mushrooms. Combine and top with onions, sprouts and soy.', 'Cut-friendly.'),
  r('baked_chicken', 'Baked Chicken Dinner', 'Dinner', 'AHG', 1, 280, 45, 0, 10,
    ['1 chicken breast, sliced horizontally', 'Grapeseed oil', 'Salt and pepper'],
    'Rub with oil and seasoning; bake at 350°F / 175°C for about 20 minutes.', 'Cut-friendly.'),
  r('spinach_pasta', 'Spinach Pasta', 'Dinner', 'AHGV', 6, 317, 13, 58, 6,
    ['16 oz whole-wheat pasta (or 1 cup quinoa)', 'Handful baby spinach', '1 cup basil', '3 cloves garlic', '1 tbsp grapeseed oil', '⅓ cup almond milk', '½ cup mozzarella (optional, included)'],
    'Blend spinach and basil, sauté garlic, add milk and greens and simmer until thick. Toss with pasta and cheese.'),
  r('champion_chilli', 'Champion Chilli', 'Dinner', 'AHGV', 3, 310, 22, 32, 12,
    ['½ lb ground turkey (or chickpeas)', '2 cans diced tomatoes', '1 can kidney beans', '1 red pepper', '1 green pepper', '1 sweet onion', '4 cloves garlic', 'Salt, chilli powder', 'Rice cheddar (optional, not included)'],
    'Simmer tomatoes and beans; add browned turkey and sautéed veg; season.'),
  r('cod_tilapia', 'Cod or Tilapia', 'Dinner', 'AHG', 1, 180, 30, 1, 6,
    ['1 cod or tilapia fillet', 'Salt, rosemary, pepper', '½ lemon', 'Grapeseed oil'],
    'Rub with oil and spices; bake 15 minutes at 350°F / 175°C; finish with lemon.', 'Cut-friendly.'),
  r('breaded_chicken', 'Thoro-Breaded "Fried" Chicken', 'Dinner', 'AHG', 1, 597, 61, 34, 32,
    ['1 chicken breast', '1 cup oat bran or buckwheat', '1 egg', '⅓ cup almond milk', '1 tbsp ground flax', 'Coconut oil'],
    'Dip in egg and milk, roll in oat bran and flax, pan-fry 3–4 minutes a side.', 'Assumes about half the coating sticks.'),
  r('pineapple_quinoa', 'Pineapple Chicken "Fried" Quinoa', 'Dinner', 'AHG', 4, 336, 22, 42, 8.5,
    ['1 cup uncooked quinoa', '1 chicken breast', '1 cup crushed pineapple', '2 eggs', '¾ cup mushrooms', '3 tbsp low-sodium soy', '3 green onions', '1 cup carrots'],
    'Cook quinoa; cook chicken and eggs separately; sauté veg; combine everything with pineapple and soy.'),
  // Snacks
  r('yogurt_bowl', 'Yogurt, Fruit & Honey Bowl', 'Snack', 'AHG', 1, 267, 24, 42, 1,
    ['1 cup Greek yogurt (0% fat)', '1 cup fresh berries', '1 tbsp honey'], 'Combine.'),
  r('nut_toast', 'Toast with Nut Butter', 'Snack', 'AHV', 1, 174, 8, 18, 8.5,
    ['1 slice toasted bread', '1 tbsp peanut butter (or honey or banana)'], 'Spread and eat.'),
  r('classic_cereal', 'Classic Cereal', 'Snack', 'AHV', 1, 210, 7, 46, 3.5,
    ['1 serving Kashi Autumn Wheat', '1 cup almond milk', 'Cinnamon', 'Fresh fruit (optional)'], 'Pour and eat.'),
  r('fruit_nuts', 'Fruit & Nuts', 'Snack', 'AHGV', 1, 259, 6.5, 31, 14,
    ['1 apple', '1 oz almonds'], 'Pair a fruit with a handful of nuts.'),
  r('the_avocado', 'The Avocado', 'Snack', 'AHGV', 1, 382, 5, 32, 29,
    ['1 avocado', '1 orange'], 'Spoon out the avocado; pair with an orange.'),
  r('green_schmear', 'Green Schmear', 'Snack', 'AHGV', 1, 240, 6, 24, 15.5,
    ['½ avocado', '1 slice bread'], 'Smear the avocado on the bread.'),
  r('guacamole', 'Simple Guacamole Dip', 'Snack', 'AHGV', 4, 170, 2, 11, 15,
    ['2 large avocados', '¼ tomato', '2–3 tbsp lime juice', '⅓ cup onion', '½ tsp chilli powder', '½ tsp sea salt', 'Jalapeños (optional)'],
    'Mash everything together.'),
  // Juices
  r('bapple_juice', 'Bapple Juice', 'Juice', 'AHGV', 1, 345, 6, 63, 7.6,
    ['1 beet with leaves', '4 apples', '2 celery sticks (optional)', '2 tbsp chia seeds'],
    'Juice beet, apples and celery; stir in chia.'),
  r('kitchen_sink', 'The Kitchen Sink', 'Juice', 'AHGV', 2, 393, 4, 63, 14.5,
    ['1 beet with leaves', '4 apples', '2 oranges', '1 lemon', '1 cup strawberries', 'Handful spinach', '4 carrots', '3 celery stalks', '1 tomato', '2 tbsp hemp oil', 'Ginger'],
    'Juice together; stir in hemp oil.'),
];

// ---------------------------------------------------------------------------
// Supplement stacks from your notes. `food` = calories the stack adds.
// ---------------------------------------------------------------------------
const STACK_PRESETS = [
  { id: 'mass', name: 'Mass Gainer', food: { kcal: 590, p: 41, c: 102, f: 2 }, items: [
    ['Whey protein isolate', 45, 'g'], ['Maltodextrin', 75, 'g'], ['Ground flax meal', 2, 'tsp'], ['Dextrose', 30, 'g'],
    ['Potassium bicarbonate', 1, 'g'], ['Creatine', 5, 'g'], ['L-Glutamine', 5, 'g'], ['L-Taurine', 1, 'g']] },
  { id: 'builder', name: 'Muscle Builder', food: { kcal: 28, p: 7, c: 0, f: 0 }, items: [
    ['L-Leucine', 7, 'g'], ['Alpha lipoic acid', 100, 'mg'], ['Creatine', 5, 'g']] },
  { id: 'sport', name: 'Sports Performance', food: { kcal: 385, p: 0, c: 96, f: 0 }, items: [
    ['Maltodextrin', 75, 'g'], ['Fructose (glucose)', 25, 'g']] },
  { id: 'post', name: 'Post-workout Recovery', food: { kcal: 290, p: 0, c: 75, f: 0 }, items: [
    ['Creatine ethyl ester', 10, 'g'], ['Alpha lipoic acid', 200, 'mg'], ['Taurine', 1.3, 'g'], ['Glutamine', 1, 'g'],
    ['Dextrose', 75, 'g'], ['Potassium bicarbonate', 1, 'g']] },
];

// ---------------------------------------------------------------------------
// Goals (from your goals table). metric milestones tick themselves.
// ---------------------------------------------------------------------------
const GOAL_SEED = [
  { area: 'Health & Wellness', title: 'Improve Physical Fitness', main: true, milestones: [
    { text: 'Weigh 85 kg or less', metric: { type: 'weight', value: 85 } },
    { text: 'Weigh 80 kg or less', metric: { type: 'weight', value: 80 } },
    { text: 'Reach 77 kg: goal weight', metric: { type: 'weight', value: 77 } },
    { text: 'Complete 16 training sessions (the 4-week cycle)', metric: { type: 'sessions', value: 16 } },
    { text: 'Complete a full Mentzer cycle (4 HIT sessions)', metric: { type: 'hitSessions', value: 4 } },
    { text: '14 days with diet dialled in', metric: { type: 'dietStreak', value: 14 } },
  ] },
  { area: 'Health & Wellness', title: 'Enhance Mental Discipline', main: true, milestones: [
    { text: 'Write your 12-month vision (Author tab)', metric: { type: 'vision' } },
    { text: '7 days coffee-free', metric: { type: 'streak', value: 7 } },
    { text: '30 days coffee-free', metric: { type: 'streak', value: 30 } },
    { text: 'Plan tomorrow 14 nights running', metric: { type: 'planStreak', value: 14 } },
    { text: '30 gratitude entries', metric: { type: 'reflections', value: 30 } },
  ] },
  { area: 'Wealth & Career', title: 'Generate Passive Income', milestones: [] },
  { area: 'Wealth & Career', title: 'Build Business Ventures', milestones: [] },
  { area: 'Wealth & Career', title: 'Ensure Financial Security', milestones: [] },
  { area: 'Family & Personal', title: "Focus on Children's Development", milestones: [] },
  { area: 'Family & Personal', title: 'Strengthen Family Bonds', milestones: [] },
  { area: 'Family & Personal', title: 'Pursue Personal Interests', milestones: [] },
  { area: 'Technology & Learning', title: 'Master AI and Local Models', milestones: [] },
  { area: 'Technology & Learning', title: 'Organize Data Efficiently', milestones: [] },
];

// ---------------------------------------------------------------------------
// Self-authoring prompts (training-focused) and the evening reflection
// ---------------------------------------------------------------------------
const AUTHOR_PROMPTS = [
  ['vision', 'Your next 12 months', 'Describe the body, energy and daily habits you will have in 12 months if you follow through. Be specific: weight, how clothes fit, what you can lift, how you feel waking up.'],
  ['avoid', 'The future to avoid', 'Describe where you end up in 12 months if you let things slide. What does it cost you, and the people who depend on you?'],
  ['why', 'Why it matters', 'Why does getting to 75–77 kg and staying strong matter to you, and to your family?'],
  ['strengths', 'Strengths to lean on', 'Which of your strengths will carry you through the hard weeks?'],
  ['pitfalls', 'Pitfalls and your plan', 'Which habits, times of day or situations usually derail you? For each, write what you will do instead.'],
];

const REFLECTION_QUESTIONS = [
  ['grateful', 'Three things I\'m grateful for today'],
  ['well', 'What went well today?'],
  ['challenges', 'What challenges did I face?'],
  ['lessons', 'What lesson can I take from today?'],
  ['intention', 'What is my intention for tomorrow?'],
];

const MENTZER_PRINCIPLES = [
  ['Intensity', 'Take every work set to positive failure: the point where another full rep is impossible despite your greatest effort.'],
  ['Brevity', 'One working set per exercise after warm-ups. More sets dig a deeper hole in your recovery.'],
  ['Infrequency', 'Growth happens during recovery. Start at every 5 days; if progress stalls, add rest days, not sets.'],
  ['Progression', 'Keep a progress chart. When you reach the top of the rep range, add about 10% weight.'],
  ['Form', 'About 4 seconds up, a 2-second pause, 4 seconds down. No momentum.'],
  ['Pre-exhaust', 'Superset an isolation move straight into a compound (pec deck → incline press) with no rest between.'],
];

const QUOTES = [
  ['Waste no more time arguing about what a good man should be. Be one.', 'Marcus Aurelius'],
  ['The impediment to action advances action. What stands in the way becomes the way.', 'Marcus Aurelius'],
  ['If it is not right, do not do it; if it is not true, do not say it.', 'Marcus Aurelius'],
  ['Very little is needed to make a happy life; it is all within yourself, in your way of thinking.', 'Marcus Aurelius'],
  ['Dwell on the beauty of life. Watch the stars, and see yourself running with them.', 'Marcus Aurelius'],
  ['We suffer more often in imagination than in reality.', 'Seneca'],
  ['It is not that we have a short time to live, but that we waste a lot of it.', 'Seneca'],
  ['Difficulties strengthen the mind, as labour does the body.', 'Seneca'],
  ['Begin at once to live, and count each separate day as a separate life.', 'Seneca'],
  ['Associate with those who will make a better man of you.', 'Seneca'],
  ['No man is free who is not master of himself.', 'Epictetus'],
  ['First say to yourself what you would be; and then do what you have to do.', 'Epictetus'],
  ['How long are you going to wait before you demand the best for yourself?', 'Epictetus'],
  ['No great thing is created suddenly.', 'Epictetus'],
  ['Wealth consists not in having great possessions, but in having few wants.', 'Epictetus'],
  ['It is difficulties that show what men are.', 'Epictetus'],
];


// ---------------------------------------------------------------------------
// How to make each recipe: [prep minutes, cook minutes, steps, keeps/batch tip].
// Written from the ingredients and method above; times are my estimates.
// ---------------------------------------------------------------------------
const PREP = {
  gironda1: [5, 12, ['Fry the 3 pork patties over medium heat, 4–5 minutes a side, until cooked through.', 'Move them to the plate and crack the 6 eggs into the same pan.', 'Fry or scramble the eggs in the fat left from the patties.'], 'Cook patties for two days at once; reheat them while the eggs cook.'],
  gironda2: [5, 10, ['Take the steak out of the fridge 20 minutes early and pat it dry. Season with salt.', 'Sear in a very hot pan, 2–4 minutes a side depending on thickness. Rest it for 5 minutes.', 'Fry or scramble the 6 eggs while the steak rests.'], ''],
  dplate_b: [5, 10, ['Palm-sized portion of protein (eggs, yogurt, fish).', 'Add a fist of fruit or vegetables.', 'Keep added fat to a thumb.'], ''],
  dplate_l: [5, 15, ['Palm-to-hand-sized lean protein.', 'Fill half the plate with greens and coloured veg.', 'Light dressing only.'], ''],
  dplate_d: [5, 20, ['Hand-sized lean protein.', 'Two fists of vegetables.', 'A small portion of starch on training days.'], ''],
  dplate_s: [2, 0, ['Pick a high-protein option: Greek yogurt, a shake or cold chicken.'], ''],
  breakfast_bowl: [3, 8, ['Boil the cup of water.', 'Stir in the oat bran and berries and simmer on low, stirring, until thick (about 5 minutes).', 'Take off the heat; stir in flax, raisins and cinnamon.', 'Top with the nut butter and sliced banana.'], 'Best on training days: it is a high-carb bowl.'],
  pitbull_pancakes: [5, 10, ['Whisk the pancake mix, egg and water into a smooth batter.', 'Heat a little coconut oil in a pan over medium-low heat.', 'Pour small rounds; flip when bubbles form on top (about 2 minutes), then 1 more minute.', 'Serve with Fresh Berry Syrup.'], 'Cooked pancakes freeze well; toast from frozen.'],
  east_coast_toast: [3, 6, ['Beat the egg with the almond milk in a shallow dish.', 'Soak each slice of bread for a few seconds a side.', 'Brown both sides in a little coconut oil over low heat.', 'Dust with cinnamon or top with fruit.'], ''],
  berry_syrup: [2, 8, ['Put the water and berries in a small pan over low heat.', 'Simmer until the fruit softens (about 5 minutes), then mash.', 'Stir in the agave if using.'], 'Keeps 4 days in the fridge.'],
  oats_smoothie: [5, 0, ['Peel the orange and banana.', 'Put everything in the blender with the ice.', 'Blend until creamy.'], 'High carb: best straight after training.'],
  salmon_salad: [10, 0, ['Drain the salmon into a bowl.', 'Chop the celery and onion finely.', 'Mash the salmon with the avocado, mustard, relish, pepper and olives.', 'Stir in the celery and onion. Serve in a wrap or on bread.'], 'Keeps 2 days in the fridge (add the avocado on the day).'],
  chickpea_salad: [10, 0, ['Rinse and drain the chickpeas.', 'Chop the cucumber, onion and tomato; halve the strawberries.', 'Toss everything with the spinach and kale.', 'Dress with oil and balsamic just before eating.'], 'On a cut, halve the oil and walnuts.'],
  egg_salad: [5, 12, ['Hard-boil the eggs (10–12 minutes), cool in cold water and peel.', 'Chop the eggs and onion.', 'Mash with the avocado, salt and pepper.', 'Serve on bread, in a wrap or over salad.'], 'Boil a dozen eggs on batch day; they keep 5 days unpeeled.'],
  tuna_salad: [10, 12, ['Hard-boil the egg, cool and chop.', 'Drain the tuna.', 'Finely chop the onion and celery.', 'Mix everything with the mashed avocado, mustard and relish. Serve over greens.'], 'Cut-friendly: 46 g protein.'],
  supafly_chicken: [10, 10, ['Cut the chicken into bite-sized pieces and cook in a little grapeseed oil until no longer pink (6–8 minutes).', 'Let it cool.', 'Halve the grapes, chop the celery, rinse the chickpeas.', 'Mash the avocado with lemon juice, salt and pepper; fold everything together and chill.'], 'Keeps 2 days in the fridge.'],
  omelette: [5, 10, ['Slice the pepper, onion and mushrooms; sauté until soft, then wilt in the spinach.', 'Beat the eggs with the almond milk and pour into a second hot, oiled pan. Don\'t stir.', 'When almost set, flip, add the veg and cheese to one half and fold.', 'Serve with the avocado on toast (or skip the toast to save about 160 kcal).'], ''],
  egg_scramble: [5, 8, ['Sauté the pepper and onion for 2 minutes.', 'Add the mushrooms, then the spinach until it wilts.', 'Pour in the beaten eggs and stir gently until just set.', 'Stir in the cheese and serve with avocado toast (optional).'], ''],
  strawberry_salad: [5, 0, ['Arrange the spinach on a plate.', 'Slice the strawberries and avocado over the top.', 'Scatter the walnuts (use ¼ cup on a cut).', 'Drizzle lightly with oil and balsamic.'], 'Very high fat as written.'],
  pasta_salad: [10, 12, ['Cook the rotini, drain and rinse under cold water.', 'Steam the broccoli for 4 minutes; cool.', 'Mince the garlic and chop the tomato.', 'Toss everything with the chickpeas, chill, then dress and add the cheese to serve.'], 'Keeps 3 days in the fridge (dress on the day).'],
  spinach_salad: [5, 0, ['Put a handful of spinach in a bowl.', 'Add a handful each of chopped coloured veg and fruit.', 'Dress lightly with hemp oil and cider vinegar.'], 'Dolce\'s light weight-cut meal.'],
  waldorf_salad: [15, 0, ['Mix the yogurt, avocado, parsley, honey and pepper into a dressing.', 'Core and chop the apples; slice the celery.', 'Toss the apples, celery and raisins with the lemon juice and dressing.', 'Add the walnuts and serve on the romaine.'], 'Makes 4: keeps 2 days (add walnuts on the day).'],
  oil_vinegar: [1, 0, ['Whisk 1 tbsp olive oil with 1 tbsp balsamic.'], ''],
  natures_dressing: [1, 0, ['Whisk 1 tbsp hemp oil with 1 tbsp apple cider vinegar.'], ''],
  grapeseed_pesto: [5, 0, ['Grind or blend the basil to a paste.', 'Stir in the grapeseed oil.'], 'Keeps a week in a sealed jar in the fridge. Serving = 1 tbsp.'],
  strawberry_vinaigrette: [5, 0, ['Hull the strawberries.', 'Blend everything until smooth.'], 'Keeps 5 days in the fridge. Serving = 2 tbsp.'],
  chicken_asparagus: [10, 15, ['Snap the woody ends off the asparagus and steam it for 4 minutes.', 'Dice the shallot and garlic; sauté in a little peanut oil for 2 minutes.', 'Add the sliced chicken and cook until no longer pink (6–8 minutes).', 'Add the asparagus and soy or teriyaki; toss and serve.'], 'Cut-friendly. Doubles easily for tomorrow\'s lunch.'],
  string_beans: [10, 15, ['Top and tail the beans; steam for 5 minutes.', 'Slice the mushrooms and garlic.', 'Sauté the garlic and mushrooms in grapeseed oil for 3 minutes.', 'Add the beans and brown for 6–8 minutes.'], 'Side dish for 6: keeps 3 days.'],
  turkey_burgers: [10, 12, ['Mince the garlic.', 'Mix the turkey, oat bran, egg, garlic, sauce and seasoning.', 'Shape 4–5 patties.', 'Cook 4–6 minutes a side until cooked through. Serving = 2 patties, no bun.'], 'Freeze raw patties between baking paper.'],
  fighter_fajitas: [10, 15, ['Slice the chicken; toss with chilli powder, cumin, salt and pepper.', 'Cook in a hot pan until done (6–8 minutes). Warm the beans.', 'Mash the avocado with lemon juice; chop the tomato and lettuce.', 'Warm the tortillas and fill. Serving = 2–3 fajitas.'], ''],
  honey_salmon: [2, 10, ['Rub the salmon with a little grapeseed oil and sea salt.', 'Cook in a hot pan, 3–5 minutes a side.', 'Drizzle with honey to serve.'], 'Cut-friendly: 51 g protein.'],
  power_pasta: [15, 40, ['Chop the peppers and onion; mince the garlic.', 'Simmer the tomatoes with basil, oregano and salt for 30 minutes.', 'Meanwhile sauté the veg, and brown the turkey in a separate pan.', 'Stir the veg and turkey into the sauce. Cook the pasta and serve.'], 'Batch cook: 6 servings. Freeze the sauce in portions.'],
  portabella_chicken: [10, 20, ['Season the chicken with salt, oregano and pepper and cook through (about 6 minutes a side).', 'Slice the mushroom; brown it with the garlic.', 'Add the spinach until wilted, then the asparagus for 3–4 minutes.', 'Plate the veg and top with the sliced chicken.'], 'Use a whole breast for about 50 g protein.'],
  sumo_stir_fry: [10, 15, ['Slice the chicken and cook in a little peanut oil until done.', 'Steam the broccoli for 4 minutes.', 'Brown the mushrooms in a hot pan.', 'Combine, then top with green onions, bean sprouts and soy.'], 'Cut-friendly: 55 g protein.'],
  baked_chicken: [3, 20, ['Heat the oven to 175 °C (350 °F).', 'Slice the breast in half horizontally so it cooks evenly.', 'Rub with oil, salt and pepper.', 'Bake about 20 minutes until the juices run clear.'], 'Bake 4–6 breasts on batch day: keeps 3 days.'],
  spinach_pasta: [10, 15, ['Cook the pasta (or quinoa).', 'Blend the spinach and basil.', 'Sauté the garlic in grapeseed oil, add the almond milk and greens and simmer until thick.', 'Toss with the pasta and cheese.'], 'Makes 6.'],
  champion_chilli: [10, 35, ['Chop the peppers and onion; mince the garlic.', 'Brown the turkey; sauté the veg.', 'Add the tomatoes, beans, salt and chilli powder.', 'Simmer 25–30 minutes.'], 'Batch cook: freezes well.'],
  cod_tilapia: [3, 15, ['Heat the oven to 175 °C (350 °F).', 'Rub the fillet with oil, salt, rosemary and pepper.', 'Bake 15 minutes.', 'Finish with a squeeze of lemon.'], 'Cut-friendly.'],
  breaded_chicken: [10, 10, ['Beat the egg with the almond milk.', 'Mix the oat bran and flax on a plate.', 'Dip the chicken in the egg, then roll in the coating.', 'Pan-fry in coconut oil, 3–4 minutes a side, until cooked through.'], ''],
  pineapple_quinoa: [10, 25, ['Rinse and cook the quinoa (about 15 minutes); spread it out to cool.', 'Cook the diced chicken; scramble the eggs separately.', 'Sauté the mushrooms, carrots and green onions.', 'Combine everything with the pineapple and soy and heat through.'], 'Makes 4: keeps 3 days.'],
  yogurt_bowl: [2, 0, ['Spoon the yogurt into a bowl.', 'Top with the berries and honey.'], ''],
  nut_toast: [1, 3, ['Toast the bread.', 'Spread with the peanut butter.'], ''],
  classic_cereal: [1, 0, ['Pour the cereal and almond milk.', 'Add cinnamon and fruit.'], ''],
  fruit_nuts: [1, 0, ['Pair an apple with a small handful (1 oz) of almonds.'], ''],
  the_avocado: [2, 0, ['Halve the avocado and spoon it out.', 'Eat with the orange.'], ''],
  green_schmear: [2, 2, ['Toast the bread.', 'Mash the avocado onto it.'], ''],
  guacamole: [10, 0, ['Mash the avocados.', 'Finely chop the tomato and onion.', 'Stir everything together with lime, chilli and salt.'], 'Press cling film onto the surface so it stays green.'],
  bapple_juice: [10, 0, ['Wash the beet, leaves and apples.', 'Juice the beet, apples and celery.', 'Stir in the chia and let it sit 5 minutes.'], ''],
  kitchen_sink: [15, 0, ['Wash and trim everything; peel the oranges and lemon.', 'Juice it all together.', 'Stir in the hemp oil.'], ''],
};

// ---------------------------------------------------------------------------
// Mentzer tiers and advanced techniques
// ---------------------------------------------------------------------------
const TIERS = [
  ['beginner', 'Beginner', 'Start with the 5-Day Break-in to learn the lifts and the feel of failure, then move to the Athlete\'s Routine. Stop short of failure until day 5 of the break-in.'],
  ['intermediate', 'Intermediate', 'Split routines with one set to positive failure per exercise, pre-exhaust supersets and 4–7 days between workouts.'],
  ['advanced', 'Advanced', 'Consolidated routines of 2–3 exercises, plus Mentzer\'s advanced methods: Rest-Pause, Omni-Contraction, Infitonic and static holds. Higher intensity means shorter, rarer workouts.'],
];

// log: how the logger records sets for this technique.
//   singles = weight per rep, reps fixed at 1 · hold = weight + seconds held · failhold = reps then a hold
const TECHNIQUES = [
  { id: 'restpause', name: 'Rest-Pause', log: 'singles', sets: 4,
    summary: 'Four all-out singles, 10 seconds apart.',
    how: ['Warm up with a couple of lighter sets.', 'Rep 1: the heaviest weight you can lift once. Put it down and rest 10 seconds at most.', 'Rep 2: same weight. A partner helps just enough for you to barely finish.', 'Rest 10 seconds, reduce the weight about 10%, and do rep 3 on your own.', 'Rest 10 seconds; rep 4, with help if needed. Never more than 4–5 reps.'],
    rules: 'One Rest-Pause set per body part at most. It can finish a pre-exhaust cycle (pec deck to failure, then incline presses Rest-Pause). Running it exclusively: no more than 4–6 weeks.',
    source: 'The Wisdom of Mike Mentzer, ch. 5' },
  { id: 'omni', name: 'Omni-Contraction', log: 'singles', sets: 4,
    summary: 'Maximum singles with three static stops on the way down.',
    how: ['After warming up, choose a weight for a maximum single.', 'Lift it once.', 'On the way down, stop at three points: near the top, the middle and near the bottom.', 'At each stop, try to raise the weight again (you shouldn\'t be able to) for 2–3 seconds at most.', 'Rest 10 seconds between reps, 4–5 reps in all, as in Rest-Pause.'],
    rules: 'Works positive, static and negative strength on every rep. Always have a partner for safety. Limit reps to 4.',
    source: 'The Wisdom of Mike Mentzer, ch. 5' },
  { id: 'hold', name: 'Static hold (Max Contraction)', log: 'hold', sets: 1,
    summary: 'Hold the weight in the fully contracted position, then lower it under control.',
    how: ['Choose a weight you can hold at full contraction for about 8–12 seconds (upper body) or 15–30 seconds (lower body).', 'Get the weight to the contracted position (a partner can help lift it).', 'Hold it there as hard as you can until it starts to drop.', 'Lower it slowly under strict control.', 'One hold and one negative is enough.'],
    rules: 'Best on isolation moves with resistance at full contraction: pec deck, machine laterals, leg extension, leg curl, calf raise; and the close-grip, palms-up pulldown. John Little later built his Max Contraction system on this idea.',
    source: 'The Wisdom of Mike Mentzer, ch. 5 (from HIT the Mike Mentzer Way, ch. 11)' },
  { id: 'failhold', name: 'Failure + hold', log: 'failhold', sets: 1,
    summary: 'A set to positive failure, then straight into a hold to failure.',
    how: ['Do a normal set to positive failure.', 'Without resting, hold the weight in the contracted position until it drops.', 'Lower it under control.'],
    rules: 'Mentzer used this as a variation on pure holds with his clients.',
    source: 'The Wisdom of Mike Mentzer, ch. 5' },
  { id: 'infitonic', name: 'Infitonic', log: 'singles', sets: 4,
    summary: 'A maximum single, then a partner pushes down as you lower it.',
    how: ['After warming up, lift the heaviest weight you can for one rep.', 'Your partner presses down on the bar or stack to add resistance.', 'Fight the extra pressure all the way down.'],
    rules: 'Follow the Rest-Pause guidelines: short rests, few reps, one set. Needs a partner.',
    source: 'The Wisdom of Mike Mentzer, ch. 4–5' },
  { id: 'forced', name: 'Forced reps', log: 'normal', sets: 1,
    summary: 'Two reps with just enough help after a set to failure.',
    how: ['Take the set to positive failure.', 'Your partner helps you complete two more reps, just enough that you barely finish them.'],
    rules: 'Use occasionally (every third or fourth workout), never on every exercise. Needs a spotter.',
    source: 'Heavy Duty' },
  { id: 'negatives', name: 'Negatives', log: 'normal', sets: 1,
    summary: 'Lowering-only reps after failure.',
    how: ['At the end of a set to failure (or after forced reps), a partner lifts the weight for you.', 'Lower it as slowly as you can. The first two you may even be able to stop.', 'Stop when you can no longer control the descent, or a rep before.'],
    rules: 'Use on a random basis, not on every exercise. Needs a spotter.',
    source: 'Heavy Duty' },
];

// ---------------------------------------------------------------------------
// Fasting
// ---------------------------------------------------------------------------
const WINDOW_PRESETS = [['16:8', 8], ['18:6', 6], ['20:4', 4], ['OMAD', 1]];

// Milestones for an extended fast (hours). Wording kept general, not medical advice.
const FAST_STAGES = [
  [12, 'Past 12 hours', 'Most people are running low on stored carbohydrate and burning more fat.'],
  [18, '18 hours', 'Your normal daily fast. Everything past here is a bonus.'],
  [24, 'One full day', 'Hunger often comes in waves and passes. Keep sipping water and electrolytes.'],
  [36, '36 hours', 'Autophagy (cellular clean-up) is thought to be well under way by now, though exact timing in people is hard to measure. Take it easy: light walking only, no heavy training.'],
  [48, 'Two days', 'Break this fast gently (see below).'],
  [72, 'Three days', 'Please don\'t go past 72 hours without your GP\'s say-so.'],
];

const FAST_SAFETY = [
  'Water through the day, plus electrolytes on long fasts: sodium (a pinch of salt), potassium and magnesium.',
  'Stop if you feel faint, dizzy, confused or have palpitations. Eat something and rest.',
  'Break fasts over 48 hours gently: a small, easy meal (broth, eggs, some cooked veg), then wait an hour before a full meal.',
  'Talk to your GP before fasting over 72 hours, or before any extended fast if you take medication (especially for blood pressure or diabetes).',
];

// ---------------------------------------------------------------------------
// No-coffee chain support (shown in the first days and after a reset)
// ---------------------------------------------------------------------------
const COFFEE_TIPS = [
  [1, 'Day 1', 'Headaches, fog and tiredness are normal for the first few days. Drink water, take the morning walk and get daylight early.'],
  [2, 'Day 2', 'Often the hardest day. Tea is fine: swap the ritual, not the mug. Go to bed on time tonight.'],
  [3, 'Day 3', 'Symptoms usually peak around now and ease soon after. You are through the worst of it.'],
  [7, 'One week', 'Sleep and afternoon energy usually start to feel steadier by now.'],
];

// Drinks on the Gironda cut. Zero-calorie drinks don't break the fast or the Cut day chain.
const CUT_DRINKS = {
  yes: [
    ['Water, still or sparkling', 'Your 3.5 L base. A slice of lemon or lime is fine.'],
    ['Electrolytes, sugar-free', 'Salt, potassium and magnesium. Important on low carb: it stops the headaches, cramps and flat feeling. Take some after sweat-suit walks and on long fasts.'],
    ['Black tea', 'No milk or sugar while fasting. Has some caffeine, so keep it before mid-afternoon.'],
    ['Green tea', 'Plain. Also has some caffeine.'],
    ['Herbal and fruit teas', 'Peppermint, chamomile, rooibos and similar. Caffeine-free, so fine in the evening.'],
  ],
  window: [
    ['Tea with a splash of milk', 'A splash only, with a meal. Not during the fast.'],
    ['Bone broth or beef stock', 'About 40 kcal a mug, plus salt. Good on long fasts or if you feel light-headed.'],
    ['Diet or zero-sugar fizzy drinks', 'No calories, but they keep the sweet tooth going. One a day at most, never an energy-drink brand.'],
  ],
  no: [
    ['Coffee, including decaf', 'Your No coffee chain. Decaf keeps the habit cue alive.'],
    ['Energy drinks', 'Your No energy drinks chain, sugar-free ones included.'],
    ['Fruit juice, smoothies, regular fizzy drinks', 'Liquid sugar: it breaks the fast, the low carb and the Cut day.'],
    ['Alcohol', 'Empty calories, worse sleep, and slower recovery from HIT sessions.'],
    ['Milky drinks, protein shakes, lattes', 'They\'re food. Logged as a meal, they break the Cut day chain.'],
  ],
};
