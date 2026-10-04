'use strict';
/* Life RPG content: stats, the 4 pillars, their goals and seed quests.
   Quest ids are stable: logs are keyed by them. Edit labels and XP in Setup, not here. */

// [id, name, what drives it]
const STATS = [
  ['STR', 'Strength', 'Workouts and lifting volume'],
  ['VIT', 'Vitality', 'Diet, recovery, steps, no alcohol or coffee'],
  ['INT', 'Intellect', 'AI builds, local models and data'],
  ['DISC', 'Discipline', 'Perfect days and streaks'],
  ['CAP', 'Capital', 'Business, income and financial security'],
  ['CHA', 'Charisma', 'Kids, family and personal interests'],
];

// Quest fields: type daily|weekly, metric binary|numeric, xp, stat (where the XP goes).
// numeric quests have a unit and a target: reaching the target completes them.
// core quests (you can change which in Quests) cost HP when missed and are all a perfect day needs.
// schedule: only shown on scheduled training days (or days you trained).
// auto names the Trainer reading that can fill it in. clean: counts by itself unless you report a slip.
const DOMAINS = [
  {
    id: 'health_wellness', name: 'Health & Wellness', short: 'Health',
    goals: [
      { id: 'physical_fitness', title: 'Improve Physical Fitness', stats: ['STR', 'VIT'], quests: [
        { id: 'workout', label: 'Training session', sub: 'Scheduled training day', type: 'daily', xp: 50, stat: 'STR', metric: 'binary', core: true, auto: 'workout', schedule: true, dock: 'Workout' },
        { id: 'volume', label: 'Log kettlebell / weight volume', type: 'daily', xp: 30, stat: 'STR', metric: 'numeric', unit: 'kg', target: 1, auto: 'volume', schedule: true },
        { id: 'steps', label: 'Steps', type: 'daily', xp: 20, stat: 'VIT', metric: 'numeric', unit: 'steps', target: 15000, auto: 'steps', dock: 'Steps' },
      ] },
      { id: 'mental_discipline', title: 'Enhance Mental Discipline', stats: ['VIT', 'DISC'], quests: [
        { id: 'meal1', label: 'Gironda meal 1', sub: '6 eggs + 3 patties, or your plan', type: 'daily', xp: 20, stat: 'VIT', metric: 'binary', core: true, auto: 'meal1', dock: 'Meal 1' },
        { id: 'meal2', label: 'Gironda meal 2', sub: '6 eggs + steak, or your plan', type: 'daily', xp: 20, stat: 'VIT', metric: 'binary', core: true, auto: 'meal2', dock: 'Meal 2' },
        { id: 'teetotal', label: 'Zero alcohol', type: 'daily', xp: 30, stat: 'VIT', metric: 'binary', core: true, auto: 'abstain', clean: true },
      ] },
    ],
  },
  {
    id: 'wealth_career', name: 'Wealth & Career', short: 'Wealth',
    goals: [
      { id: 'passive_income', title: 'Generate Passive Income', stats: ['CAP'], quests: [
        { id: 'yield', label: 'Review model yield / quantitative edge', type: 'weekly', xp: 100, stat: 'CAP', metric: 'binary' },
      ] },
      { id: 'business_ventures', title: 'Build Business Ventures', stats: ['CAP', 'INT'], quests: [
        { id: 'business', label: 'Execute one business build task', type: 'daily', xp: 60, stat: 'CAP', metric: 'binary', dock: 'Business task' },
      ] },
      { id: 'financial_security', title: 'Ensure Financial Security', stats: ['CAP'], quests: [
        { id: 'audit', label: 'Audit expenses & reserves', type: 'weekly', xp: 50, stat: 'CAP', metric: 'binary' },
      ] },
    ],
  },
  {
    id: 'family_personal', name: 'Family & Personal', short: 'Family',
    goals: [
      { id: 'children_dev', title: "Focus on Children's Development", stats: ['CHA', 'DISC'], quests: [
        { id: 'kids', label: 'Uninterrupted time with the kids', type: 'daily', xp: 50, stat: 'CHA', metric: 'binary', dock: 'Kids time' },
      ] },
      { id: 'family_bonds', title: 'Strengthen Family Bonds', stats: ['CHA'], quests: [
        { id: 'outing', label: 'Family activity / outing', type: 'weekly', xp: 80, stat: 'CHA', metric: 'binary' },
      ] },
      { id: 'personal_interests', title: 'Pursue Personal Interests', stats: ['CHA', 'INT'], quests: [
        { id: 'golf', label: 'Golf round / practice session', type: 'weekly', xp: 40, stat: 'CHA', metric: 'binary' },
      ] },
    ],
  },
  {
    id: 'technology_learning', name: 'Technology & Learning', short: 'Tech',
    goals: [
      { id: 'master_ai', title: 'Master AI and Local Models', stats: ['INT'], quests: [
        { id: 'ai', label: 'Deploy / optimise a local model or agent node', type: 'daily', xp: 75, stat: 'INT', metric: 'binary', dock: 'AI build' },
      ] },
      { id: 'organize_data', title: 'Organise Data Efficiently', stats: ['INT', 'DISC'], quests: [
        { id: 'data', label: 'Clean data pipeline / files', type: 'daily', xp: 30, stat: 'INT', metric: 'binary' },
      ] },
    ],
  },
];

// Big Five, for the Hero tab. Scores are entered by you and stay on this phone.
const TRAITS = [
  ['O', 'Openness', 'Curious, imaginative, open to change'],
  ['C', 'Conscientiousness', 'Organised, persevering, reliable'],
  ['E', 'Extraversion', 'Sociable, energetic, cheerful'],
  ['A', 'Agreeableness', 'Trusting, considerate, modest'],
  ['N', 'Emotional stability', 'Calm, patient, self-assured'],
];

// Rules of the game, shown in Hero → How it works.
const RULES = [
  ['One tap', 'Every quest is a single tap or a single number. Trainer data fills in what it can: workouts, volume, steps, the two Gironda meals and coffee slips. Your taps win; an Edited badge shows where, with a button to go back to Trainer.'],
  ['Core quests', 'By default: the training session, both Gironda meals and zero alcohol (and coffee, if you switch that rule on). A perfect day needs only the core quests. Change which quests are core in Quests.'],
  ['Training follows your schedule', 'The session quest appears only on scheduled training days (Setup, or Trainer\'s plan). Recovery days are neutral: no XP, no HP loss. Miss a session and you have a grace window (1 day by default) to train before it counts as missed. A pause for illness, injury or doctor\'s orders stops the quest without breaking anything.'],
  ['HP', 'Each core quest missed costs HP once its day (or training window) is over: 10 by default, adjustable in Setup. A perfect day restores 10.'],
  ['Respec', 'At 0 HP you lose the XP inside your current level and HP refills. You see a confirmation before any tap that would cause one, and every respec is kept in the log. You can switch respecs off in Setup.'],
  ['Streaks', 'Each perfect day in a row adds ×0.1 to the next day\'s XP, up to ×1.5.'],
  ['Discipline', 'Perfect days give +20 DISC, for up to 5 days a week (+100), plus +50 for a full week of weekly quests. Stats grow with the square root of their XP and stop at 99, so no single stat runs away.'],
  ['Honest maths', 'XP, HP and stats are recalculated from your logs every time. Reopening a day can never pay out twice, and editing a past day can never leave the totals wrong.'],
];
