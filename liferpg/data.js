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
// core quests cost HP when a past day is missed. auto names the Trainer reading that can complete it.
const DOMAINS = [
  {
    id: 'health_wellness', name: 'Health & Wellness', short: 'Health',
    goals: [
      { id: 'physical_fitness', title: 'Improve Physical Fitness', stats: ['STR', 'VIT'], quests: [
        { id: 'workout', label: 'Training plan followed', sub: 'Trained, or a planned rest day', type: 'daily', xp: 50, stat: 'STR', metric: 'binary', core: true, auto: 'workout', dock: 'Workout' },
        { id: 'volume', label: 'Log kettlebell / weight volume', type: 'daily', xp: 30, stat: 'STR', metric: 'numeric', unit: 'kg', target: 1, auto: 'volume', optional: true },
        { id: 'steps', label: 'Steps', type: 'daily', xp: 20, stat: 'VIT', metric: 'numeric', unit: 'steps', target: 15000, auto: 'steps', dock: 'Steps', optional: true },
      ] },
      { id: 'mental_discipline', title: 'Enhance Mental Discipline', stats: ['VIT', 'DISC'], quests: [
        { id: 'gironda', label: 'Strict Gironda protocol', sub: 'Steak & eggs, nothing else', type: 'daily', xp: 40, stat: 'VIT', metric: 'binary', core: true, auto: 'gironda', dock: 'Gironda meal' },
        { id: 'teetotal', label: 'Zero alcohol / zero coffee', type: 'daily', xp: 30, stat: 'VIT', metric: 'binary', core: true, auto: 'coffee', clean: true },
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
  ['One tap', 'Every quest is a single tap or a single number. Trainer data fills in what it can: workouts, volume, steps, the Gironda meals and coffee slips.'],
  ['Core quests', 'Training plan, Gironda protocol and zero alcohol/coffee. Each one missed on a past day costs 10 HP.'],
  ['Regeneration', 'A perfect day (every daily quest you have switched on; steps and lifting volume are bonus) restores 10 HP.'],
  ['Respec', 'At 0 HP you lose the XP earned inside your current level and HP refills to 100. Your level and stats stay.'],
  ['Streaks', 'Each perfect day in a row adds ×0.1 to the next day\'s XP, up to ×1.5. One missed quest resets it.'],
  ['Discipline', 'DISC grows only from perfect days (+20) and full weeks (+50). It is the stat for showing up.'],
  ['Honest maths', 'XP, HP and stats are recalculated from your logs every time, so editing a past day can never leave them wrong.'],
];
