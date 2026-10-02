'use strict';
/* Council: content. Everything personal here comes from the "Eddie personality" folder
   (Eddie Info.pdf and the test results). Logic is in app.js. */

// Life domains, in the priority order from the profile (section 25). Re-orderable in Goals.
const DOMAINS = [
  { id: 'wealth', name: 'Wealth', icon: '£', desc: 'Income, capital, independence from benefits.' },
  { id: 'health', name: 'Health', icon: '♥', desc: 'Training, steps, sleep. Detail lives in Trainer.' },
  { id: 'father', name: 'Father', icon: '◆', desc: 'Time with the kids and teaching them to learn.' },
  { id: 'build', name: 'Build', icon: '⚙', desc: 'AI agents, automation, systems that ship.' },
  { id: 'relate', name: 'Relationships', icon: '↔', desc: 'Reciprocal, consistent relationships.' },
  { id: 'mind', name: 'Mind', icon: '◎', desc: 'Self-command, rumination, follow-through.' },
];

const VISION_SEED = 'Autonomy, financial independence, physical capability, intellectual freedom and contribution to my family, with as little compulsory work as possible. Rural, self-sufficient, own power and food, driving myself.';

// Operating rules from the Council protocol and the profile's counter-principles.
const RULES_SEED = [
  'Judge by actions, including my own. Words count only when they turn into behaviour.',
  'Systems over willpower. If something keeps failing, fix the system, not my character.',
  'Stop analysing when more information would not change the decision.',
  'One build project at a time until it ships or is killed.',
  'Research only in service of something I am building this week.',
  'Never miss twice. One miss is noise; two is a new pattern.',
  'Every analysis ends in a decision, an action and a deadline.',
];

// Big Five percentiles and other results from the folder.
const BASELINE = [
  ['Intellect / Imagination', 93, 'Generates ideas and systems fast. Feeds the novelty loop.'],
  ['Emotional stability', 76, 'Recovers well. Irritation is felt but controlled.'],
  ['Agreeableness', 25, 'Direct and tough-minded. Low tolerance for nonsense.'],
  ['Extraversion', 15, 'Recharges alone. Works best without social pressure.'],
  ['Conscientiousness', 9, 'Execution needs structure from outside, not willpower.'],
];
const OTHER_RESULTS = [
  ['MBTI', 'INTP'],
  ['Enneagram', 'Type 8, the Challenger'],
  ['Holland code', 'SIR: Social 27, Investigative 27, Realistic 21'],
  ['Fisher temperament', 'Analytical / tough-minded (40 of 43)'],
  ['Self-esteem (Rosenberg)', '17 of 30. Normal range, lower half.'],
  ['Woodworth inventory', '38 of 116. Inside the typical 20 to 55 range.'],
];

// The tension that the whole app is built around.
const CORE_TENSION = 'Intellect at the 93rd percentile and conscientiousness at the 9th. You can design almost any system. Running it day after day is the bottleneck. So this app keeps the daily part small and puts structure outside your head.';

// Enneagram 8 directions (Enneagram Institute). A lens, not a fact.
const ENNEAGRAM = {
  growth: 'Growth goes toward 2: open-hearted, protective care. For you that means your kids and putting effort into people who return it.',
  stress: 'Stress goes toward 5: withdrawing into research and analysis. Watch for it as consumption beating building.',
};

// The Council of Mind & Action (profile section 17). One working question each.
const LENSES = [
  { id: 'beck', name: 'Aaron Beck', tag: 'CBT', q: 'What is the evidence for the thought? What test would prove it wrong this week?' },
  { id: 'peterson', name: 'Jordan Peterson', tag: 'Responsibility', q: 'What responsibility is being avoided here? What is the smallest thing you can put in order today?' },
  { id: 'mate', name: 'Gabor Maté', tag: 'Needs', q: 'What might this reaction protect you from? What need sits under it? (A hypothesis, not a diagnosis.)' },
  { id: 'jung', name: 'Carl Jung', tag: 'Shadow', q: 'What do you dislike here that you also do? What part of you is being projected?' },
  { id: 'perel', name: 'Esther Perel', tag: 'Relationships', q: 'What do they do, as opposed to say? Is the exchange reciprocal? What is the pattern between you?' },
  { id: 'frankl', name: 'Viktor Frankl', tag: 'Meaning', q: 'What is this situation asking of you? Which response would you respect in ten years?' },
];

// Cognitive distortions (Beck and Burns), plus one from your own pattern list.
const DISTORTIONS = [
  ['all', 'All-or-nothing'],
  ['over', 'Overgeneralising'],
  ['filter', 'Mental filter'],
  ['disq', 'Discounting the positive'],
  ['mind', 'Mind reading'],
  ['fortune', 'Fortune telling'],
  ['mag', 'Magnifying'],
  ['emo', 'Emotional reasoning'],
  ['should', '"Should" rules'],
  ['label', 'Labelling'],
  ['personal', 'Personalising'],
  ['blame', 'Blaming'],
  ['analysis', 'Analysis as action'],
];

// Minimum standards for any relationship (profile section 6).
const STANDARDS = [
  ['consistency', 'Consistency', 'Behaves the same way over time.'],
  ['reciprocity', 'Reciprocity', 'Gives roughly what they get.'],
  ['followthrough', 'Follow-through', 'Does what they said they would.'],
  ['reliability', 'Reliability', 'Turns up, especially when it is hard.'],
  ['accountability', 'Accountability', 'Owns mistakes without disappearing.'],
  ['communication', 'Clear communication', 'Says what they mean.'],
  ['investment', 'Investment', 'Puts in time and effort unprompted.'],
];

// Behavioural patterns (profile section 15), each with a counter and a live signal computed in app.js.
const PATTERNS = [
  { id: 'novelty', name: 'Novelty loop', chain: 'New idea → high engagement → stimulation drops → execution stalls.', counter: 'New ideas go to the vault and cool off for a week. Promoting one means finishing or killing an active project.', confidence: 'Inference' },
  { id: 'research', name: 'Research replacing execution', chain: 'Interest → research → tools and prompts → planning → postponement.', counter: 'Track minutes built against minutes consumed. Research only for this week\'s build.', confidence: 'Inference' },
  { id: 'tomorrow', name: 'Tomorrow loop', chain: '"I\'ll build it tomorrow." The cost is starting, not knowing how.', counter: 'Start buttons run a 10-minute timer. The second postponement forces you to shrink the task or kill it.', confidence: 'Self-reported' },
  { id: 'overanalysis', name: 'Over-analysis', chain: 'Analysis continues after it stops changing the decision.', counter: 'Council sessions are timeboxed and only close with a decision. A verdict on file closes the topic.', confidence: 'Inference' },
  { id: 'inconsistency', name: 'Sensitivity to inconsistency', chain: 'Words and actions don\'t match → strong irritation → urge to make them admit it.', counter: 'Name the factual mismatch, decide what it means, act on it. Don\'t chase an admission.', confidence: 'Self-reported' },
  { id: 'authority', name: 'Authority resistance', chain: 'Instruction without a reason → resistance, even when it costs you.', counter: 'Every prompt in this app says why it exists. If a rule has no good reason, change it in Me.', confidence: 'Self-reported' },
];

// Hypotheses about you, tested against your own logs (profile sections 29 to 35).
const HYPOTHESES = [
  { id: 'sleep', text: 'Short sleep (under 7 h) lowers follow-through the same day.', expect: 'lower' },
  { id: 'consume', text: 'Days with more consuming than building are low-execution days.', expect: 'lower' },
  { id: 'train', text: 'Training days are better execution days.', expect: 'higher' },
  { id: 'novelty', text: 'A strong urge for something new (4 or 5) predicts a missed One Thing.', expect: 'lower' },
  { id: 'ruminate', text: 'Rumination (2+ times in a day) costs follow-through.', expect: 'lower' },
  { id: 'actmood', text: 'Doing the One Thing lifts the next day\'s mood (action before feeling).', expect: 'higher', outcome: 'mood' },
];

// Competence evidence from the profile (section 22). Facts, not praise.
const EVIDENCE_SEED = [
  ['health', 'Completed a major weight-loss effort.'],
  ['health', 'Sustained 5+ gym sessions a week through strong periods.'],
  ['mind', 'Got into university after school labelled you as unintelligent.'],
  ['build', 'Built an analytical betting system from scratch.'],
  ['mind', 'Stepped back from betting when confidence became excessive.'],
  ['mind', 'Kept outward control while strongly irritated, more than once.'],
  ['build', 'Designed a full personal operating system architecture.'],
  ['mind', 'Pursued goals single-mindedly when they mattered.'],
];

// Dormant and possible projects from the profile, placed in the vault (already cooled off).
const PROJECT_SEED = [
  { title: 'AI agents (own build, no subscriptions)', domain: 'build', money: '', note: 'Postponed repeatedly. Tooling installed more than once.' },
  { title: 'Personal AI operating system', domain: 'build', money: '', note: 'Capture → Analyse → Decide → Schedule → Execute → Measure → Learn.' },
  { title: 'Mushroom business: agar plates and spore library', domain: 'wealth', money: 'Sell agar plates and cultures.', note: 'Dormant since the move.' },
  { title: 'Analytical betting system', domain: 'wealth', money: '', note: 'Known risk: rising confidence. Kill criteria needed before any stake.' },
  { title: 'Kinetic and fluidic energy concepts', domain: 'build', money: '', note: 'Engineering hypotheses. Need numbers before anything else.' },
];

// One-tap starting points for 90-day goals.
const GOAL_TEMPLATES = {
  wealth: { title: 'First independent income', metric: '£ earned outside benefits', target: 500, why: 'Capital formation is the bottleneck for everything else.' },
  health: { title: '15,000 steps on 5 days a week', metric: 'weeks hit', target: 12, why: 'Explicit minimum. Training and diet detail stays in Trainer.' },
  father: { title: 'Weekly teaching sessions with the kids', metric: 'sessions', target: 24, why: 'Teach them how to learn. Measurable fatherhood, not a feeling.' },
  build: { title: 'Ship one working agent that saves time weekly', metric: 'milestones', target: 4, why: 'Turn AI interest into a finished asset.' },
  relate: { title: 'Write and use my minimum standards', metric: 'days with no re-analysis of a closed file', target: 60, why: 'Behaviour answers the practical question; motives don\'t need decoding.' },
  mind: { title: 'Say/Do at 80% or better', metric: 'weeks at 80%+', target: 10, why: 'Apply your own Actions vs Words standard to yourself.' },
};

// Lines from your own canon. Chosen because each one points at an action.
const LINES = [
  ['Marcus Aurelius', 'Waste no more time arguing about what a good man should be. Be one.'],
  ['Epictetus', 'First say to yourself what you would be; and then do what you have to do.'],
  ['Miyamoto Musashi', 'Do nothing that is of no use.'],
  ['Seneca', 'While we are postponing, life speeds by.'],
  ['Seneca', 'We suffer more often in imagination than in reality.'],
  ['Marcus Aurelius', 'The impediment to action advances action. What stands in the way becomes the way.'],
  ['Viktor Frankl', 'Live as if you were living already for the second time and as if you had acted the first time as wrongly as you are about to act now.'],
  ['Jordan Peterson', 'Compare yourself to who you were yesterday, not to who someone else is today.'],
  ['Jordan Peterson', 'Set your house in perfect order before you criticise the world.'],
  ['Robert Greene', 'Concentrate your forces. Intensity defeats extensity every time.'],
  ['Epictetus', 'Some things are within our power, while others are not.'],
  ['Miyamoto Musashi', 'Today is victory over yourself of yesterday.'],
];

// How the AI briefing tells Claude (or any model) to talk to you.
const AI_PROTOCOL = `Protocol:
- Zero sycophancy, no generic encouragement, no padding, minimal caveats.
- Evidence hierarchy: actions > patterns > statements > context > interpretation > speculation.
- Label claims FACT / INFERENCE / HYPOTHESIS. Never turn a hypothesis into a diagnosis.
- Use the Council lenses (Beck, Peterson, Maté, Jung, Perel, Frankl) only where useful.
- The Council exists to improve action, not replace it. End with: one decision, one action, one deadline.`;
