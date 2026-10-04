'use strict';
/* Coach content: the AI coach's modes, structured interviews, Self-Authoring, and the prompt library.
   Self-Authoring follows the structure of Jordan Peterson's Self Authoring Suite (Past, Present faults and
   virtues, Future) in our own words. The prompt library is adapted from the prompts saved in Eddie's Drive
   ("Master Prompts", "AI Council Decision Engine" and the coaching prompt screenshots).
   Nothing personal is in this file: your own answers, faults and analyses live only on the phone. */

// ---------------------------------------------------------------------------
// Safety. Shown whenever a message or answer suggests risk, and always one tap away.
// ---------------------------------------------------------------------------
const CRISIS_WORDS = /\b(suicid\w*|kill (?:my ?self|myself)|end (?:it all|my life)|want to die|better off dead|no reason to live|self[- ]?harm\w*|hurt(?:ing)? myself|cut(?:ting)? myself|overdos\w*|can'?t go on|not want to (?:be here|live))\b/i;
const CRISIS_TEXT = 'If you are thinking about ending your life or harming yourself, please talk to someone now. Samaritans: 116 123 (free, 24 hours). NHS 111, option 2 for mental health. In danger right now: 999. Text SHOUT to 85258.';

// ---------------------------------------------------------------------------
// The coach. One system prompt with a mode on top.
// ---------------------------------------------------------------------------
const COACH_BASE = `You are Eddie's coach inside his Council app. You know his profile and recent data (below, if shared).
Who he is: high intellect and openness, low conscientiousness, introverted, Enneagram 8, strong on systems design and weak on daily follow-through. He builds systems as a way of not doing the work. He responds to directness and evidence, not reassurance. He is a father, cutting from 95 kg on a Gironda diet, and building a YouTube channel and income.

How you work:
- One question at a time. Short messages. Wait for his answer.
- Reflect back what you heard in one line before asking the next question.
- Evidence hierarchy: what he did > patterns in his logs > what he says > interpretation. Label guesses as guesses.
- No flattery, no padding, no generic encouragement. Kind but straight.
- Use his own Self-Authoring words (faults, analyses, future goals) when they fit. Quote them back to him.
- Every session ends with: one decision, one action, one deadline. Offer to add the action to his commitments.

Boundaries:
- You are a coach and a reflective listener, not a clinician. Never diagnose. If something sounds clinical (low mood most days for two weeks, panic, trauma symptoms, substance dependence, eating problems), say so plainly and suggest his GP or a therapist, and keep helping with what he can do today.
- If he mentions suicide, self-harm or being unsafe: stop the coaching, respond with care, ask directly whether he is safe right now, and give UK help: Samaritans 116 123, NHS 111 option 2, 999 in danger, text SHOUT to 85258.
- Never give medication doses or advice to stop prescribed medication.`;

const COACH_MODES = [
  { id: 'therapist', name: 'Therapist', tag: 'Listen, reflect, untangle',
    prompt: `Mode: THERAPIST. Work like a skilled CBT/ACT therapist. Start by asking what is on his mind. Name feelings, ask where he feels them, separate facts from interpretations, look for the thought behind the reaction, check for thinking traps (all-or-nothing, mind reading, catastrophising, should statements, contempt for self or others). Help him see the pattern, then choose a value-led next step. Pace: slow.` },
  { id: 'coach', name: 'Coach', tag: 'Accountability and action',
    prompt: `Mode: COACH. Use GROW: Goal (what exactly by when), Reality (what is actually happening, with numbers from his logs), Options (at least three, including the boring one), Will (what, when, how he will know). Push back on vague goals and on planning instead of doing. Keep it to 10 minutes.` },
  { id: 'interview', name: 'Psychiatrist-style interview', tag: 'Structured, then a formulation',
    prompt: `Mode: STRUCTURED INTERVIEW in the style of a psychiatric assessment (for self-understanding, not diagnosis). Cover in order, one question at a time: what brings him here now; history of this problem; mood, sleep, appetite, energy, concentration, anxiety, anger; substances (alcohol, cannabis, caffeine and energy drinks); physical health; relationships and family; work and money; personal history (childhood, school, key events); strengths and supports; risk (ask directly and calmly about thoughts of self-harm). Then give a short formulation using the 4 Ps: Predisposing, Precipitating, Perpetuating, Protective factors, and three practical next steps. Say clearly where a professional would help.` },
  { id: 'council', name: 'Council roundtable', tag: 'Five advisors, then the Chairman',
    prompt: `Mode: COUNCIL DECISION ENGINE. Ask what the decision or scenario is if he has not said. Then analyse it as five advisors who stay in character and challenge hidden assumptions:
1. The Contrarian: what will fail, risks, worst cases, what he is avoiding.
2. The First Principles Thinker: rebuild the problem from basic truths; is he solving the right problem?
3. The Expansionist: hidden upside and 10x angles he is thinking too small to see.
4. The Outsider: zero insider context, raw logic and plain human behaviour; catch the curse of knowledge.
5. The Executor: what actually happens first, time and cash costs, friction.
Then list at least two points where the advisors clash. Then the Chairman's verdict under: The Core Verdict; The Single Biggest Risk; Monday Morning Actions (chronological bullets); Unresolved Human Decision Points.` },
  { id: 'future', name: 'Future self', tag: 'Talk to you in five years',
    prompt: `Mode: FUTURE SELF. Speak as Eddie five years from now who kept his Future Authoring plan (use it if shared). Be specific about what his days look like, what he is proud of, and what he had to stop doing. Then, as the coach again, ask him for the one thing he will do this week to become that person.` },
];

// ---------------------------------------------------------------------------
// Structured interviews. Offline: one question at a time, answers saved on the phone.
// type: text (default) | scale (0-10) | choice (opts) | phq (0-3 frequency)
// ---------------------------------------------------------------------------
const FREQ = [[0, 'Not at all'], [1, 'Several days'], [2, 'More than half the days'], [3, 'Nearly every day']];
const INTERVIEWS = [
  { id: 'intake', name: 'Full intake interview', mins: 25, tag: 'Psychiatrist-style assessment of where you are',
    intro: 'The questions a psychiatrist or psychologist asks at a first appointment, for your own understanding. Answer in a sentence or two. Skip anything with "Next".',
    qs: [
      ['What brings you here now? What made today the day?'],
      ['How long has this been going on, and what was happening in your life when it started?'],
      ['What have you already tried, and what happened?'],
      ['Mood: how would you describe it most days over the last two weeks?'],
      ['Sleep: what time do you go to bed and get up, and how well do you sleep?'],
      ['Eating: regular, chaotic, restrictive, bingeing? Any guilt around food?'],
      ['Energy and concentration: can you start things, and stay on them?'],
      ['Worry and anxiety: what do you worry about, and when?'],
      ['Anger and irritability: what sets you off, and what do you do with it?'],
      ['Substances: alcohol, cannabis, caffeine, energy drinks, anything else. How much, and why?'],
      ['Physical health, injuries, medication.'],
      ['Relationships: partner, children, family, friends. Who is close, who is difficult?'],
      ['Work and money: what you do, how it feels, any pressure.'],
      ['Growing up: home, school, the people who shaped you.'],
      ['The events that changed you most, good or bad.'],
      ['Strengths: what are you good at, and who or what supports you?'],
      ['If this were solved, what would be different on an ordinary Tuesday?'],
      ['Risk: in the last month, have you had thoughts that life is not worth living, or of harming yourself?', 'choice', ['No', 'Fleeting thoughts', 'Yes, often', 'I have a plan']],
    ] },
  { id: 'phq9', name: 'Mood check (PHQ-9)', mins: 3, tag: 'Depression screen used by GPs',
    intro: 'Over the last 2 weeks, how often have you been bothered by any of the following? A screen, not a diagnosis. PHQ-9 © Pfizer, free to use.',
    score: 'phq9',
    qs: [
      ['Little interest or pleasure in doing things', 'phq'],
      ['Feeling down, depressed or hopeless', 'phq'],
      ['Trouble falling or staying asleep, or sleeping too much', 'phq'],
      ['Feeling tired or having little energy', 'phq'],
      ['Poor appetite or overeating', 'phq'],
      ['Feeling bad about yourself, or that you are a failure or have let yourself or your family down', 'phq'],
      ['Trouble concentrating on things, such as reading or watching television', 'phq'],
      ['Moving or speaking so slowly that other people could have noticed, or being so fidgety or restless that you have been moving around a lot more than usual', 'phq'],
      ['Thoughts that you would be better off dead, or of hurting yourself in some way', 'phq'],
    ] },
  { id: 'gad7', name: 'Anxiety check (GAD-7)', mins: 2, tag: 'Anxiety screen used by GPs',
    intro: 'Over the last 2 weeks, how often have you been bothered by the following? A screen, not a diagnosis. GAD-7 © Pfizer, free to use.',
    score: 'gad7',
    qs: [
      ['Feeling nervous, anxious or on edge', 'phq'],
      ['Not being able to stop or control worrying', 'phq'],
      ['Worrying too much about different things', 'phq'],
      ['Trouble relaxing', 'phq'],
      ['Being so restless that it is hard to sit still', 'phq'],
      ['Becoming easily annoyed or irritable', 'phq'],
      ['Feeling afraid as if something awful might happen', 'phq'],
    ] },
  { id: 'grow', name: 'Weekly coaching (GROW)', mins: 10, tag: 'Goal, Reality, Options, Will',
    intro: 'A coaching session on one thing. Pick the thing that matters most this week.',
    qs: [
      ['Goal: what do you want, specifically, and by when?'],
      ['Reality: what is actually happening? Numbers if you have them.'],
      ['What have you been avoiding or telling yourself about it?'],
      ['Options: list at least three, including the boring one.'],
      ['Which option, and why that one?'],
      ['Will: exactly what will you do, and when?'],
      ['What will get in the way, and what will you do when it does?'],
      ['How committed are you, 0 to 10?', 'scale'],
    ] },
  { id: 'change', name: 'Change talk (motivational interview)', mins: 8, tag: 'For a habit: weed, energy drinks, coffee, food',
    intro: 'Motivational interviewing, the method addiction services use. It works by hearing your own reasons, not someone else\'s.',
    qs: [
      ['What change are you thinking about?'],
      ['What do you get out of the habit? Be honest: it does something for you.'],
      ['What does it cost you: health, money, time, family, self-respect?'],
      ['How important is changing it, 0 to 10?', 'scale'],
      ['Why that number and not lower?'],
      ['How confident are you that you can, 0 to 10?', 'scale'],
      ['What would move your confidence up one point?'],
      ['What has worked before, even for a short while?'],
      ['What is your plan for the first hard moment?'],
      ['Who could know about this plan?'],
    ] },
  { id: 'chain', name: 'Slip analysis (chain analysis)', mins: 10, tag: 'When a chain breaks',
    intro: 'A DBT chain analysis: walk back from the slip to the first link you could have broken. No blame; it\'s data.',
    qs: [
      ['What exactly happened? (The slip itself.)'],
      ['Vulnerabilities that day: sleep, hunger, stress, alone, bored, after a win?'],
      ['What was the trigger: the moment it started?'],
      ['Then what? Thoughts, feelings and actions, link by link.'],
      ['What did it give you in the moment?'],
      ['What did it cost, then and after?'],
      ['Which link was the easiest place to break the chain?'],
      ['What will you do at that link next time?'],
      ['What repairs the damage now (without punishment)?'],
    ] },
  { id: 'story', name: 'Life story interview', mins: 30, tag: 'The chapters of your life',
    intro: 'Based on the life story interview psychologists use (McAdams). Your story shapes what you think you can do next.',
    qs: [
      ['If your life were a book, what would the chapters be? Give each a title.'],
      ['High point: the best moment of your life so far, in detail.'],
      ['Low point: the worst moment, and how you got through it.'],
      ['Turning point: when your understanding of yourself changed.'],
      ['Earliest memory you can picture clearly.'],
      ['A challenge you are facing now.'],
      ['The people who shaped the story most, good and bad.'],
      ['The next chapter: what is it called, and what happens in it?'],
      ['The theme running through the whole book.'],
    ] },
  { id: 'values', name: 'Values compass', mins: 12, tag: 'What matters, and are you living it?',
    intro: 'From Acceptance and Commitment Therapy. For each area: what kind of man you want to be, and how close you are.',
    qs: [
      ['As a father: what do you want to stand for?'],
      ['How closely did you live that this week, 0 to 10?', 'scale'],
      ['In relationships: what kind of partner and friend?'],
      ['How closely, 0 to 10?', 'scale'],
      ['In work and money: what do you want to build, and why?'],
      ['How closely, 0 to 10?', 'scale'],
      ['Health and body: what is the point of the training and the cut, beyond the number?'],
      ['How closely, 0 to 10?', 'scale'],
      ['Mind and learning: what do you want to understand or make?'],
      ['How closely, 0 to 10?', 'scale'],
      ['Which area has the biggest gap, and what is one small value-led act this week?'],
    ] },
];

const SCREEN_BANDS = {
  phq9: [[0, 'Minimal'], [5, 'Mild'], [10, 'Moderate'], [15, 'Moderately severe'], [20, 'Severe']],
  gad7: [[0, 'Minimal'], [5, 'Mild'], [10, 'Moderate'], [15, 'Severe']],
};

// ---------------------------------------------------------------------------
// Self-Authoring: Past, Present (faults and virtues), Future. Same structure as the suite, our words.
// ---------------------------------------------------------------------------
const EPOCHS = [['0-5', 'Birth to 5'], ['6-11', '6 to 11'], ['12-17', '12 to 17'], ['18-24', '18 to 24'], ['25-34', '25 to 34'], ['35+', '35 to now']];
const PAST_QS = [
  ['what', 'What happened? Who was there, where, what was said.'],
  ['felt', 'How did it make you feel then, and how do you feel about it now?'],
  ['shaped', 'How did it shape who you are and what you do?'],
  ['learn', 'What can you learn from it? What would you tell yourself back then?'],
];
const TRAIT_DOMAINS = ['Extraversion', 'Openness', 'Conscientiousness', 'Emotional stability', 'Agreeableness'];
const FAULT_QS = [
  ['experience', 'An experience caused by this fault: what happened?'],
  ['alternative', 'A better outcome: how could it have gone, and what would you have done differently?'],
  ['guidelines', 'Guidelines for improvement: what will you do from now on?'],
];
const VIRTUE_QS = [
  ['experience', 'A time this virtue helped you or someone else.'],
  ['more', 'How could you use it more, or in a new area?'],
  ['protect', 'How could it go too far, and how will you keep it in balance?'],
];
const FUTURE_AREAS = [
  ['family', 'Family and fatherhood'], ['partner', 'Intimate relationship'], ['friends', 'Friends and social life'],
  ['career', 'Career, business and money'], ['learning', 'Education and learning'], ['health', 'Health, body and habits'],
  ['leisure', 'Leisure and creative work'], ['substances', 'Alcohol, cannabis, caffeine'],
];
const FUTURE_STEPS = [
  ['oneyear', 'One year: what could your life look like in a year if you took care of yourself properly?'],
  ['ideal', 'Your ideal future in 3 to 5 years, area by area.'],
  ['avoid', 'The future to avoid: where do you end up if your faults run the show?'],
  ['goals', 'Goals: turn the ideal into a few concrete goals.'],
];
const GOAL_QS = [
  ['what', 'The goal, in one line.'],
  ['why', 'Why it matters: to you, to your family, to the wider world.'],
  ['impact', 'What changes when you reach it?'],
  ['obstacles', 'Obstacles, inside you and outside.'],
  ['strategy', 'Strategy: how you will get past each obstacle.'],
  ['measure', 'How you will know you are making progress (numbers, dates).'],
];

// ---------------------------------------------------------------------------
// Prompt library, adapted from the prompts in Drive. "Run" starts a Talk session with it.
// ---------------------------------------------------------------------------
const PROMPTS = [
  ['Reflection', 'Evening reflection', 'therapist', 'Lead my evening reflection: what went well today, what was hard, what I learned, what I am grateful for, and my intention for tomorrow. One question at a time.'],
  ['Reflection', 'Emotion release', 'therapist', 'I am feeling something I cannot shift. Walk me through it like a therapist: help me name it, notice where I feel it in my body, express it safely and let it go.'],
  ['Reflection', 'Boundaries', 'therapist', 'Help me set a boundary with someone. First understand the situation and validate what I feel. Then write three scripts: kind, firm and final, plus what to say if they push back.'],
  ['Truth', 'The mirror', 'coach', 'Act as my honest shadow self. From everything you know about me (profile, faults, recent data), name the three self-sabotaging patterns I keep repeating, why I am stuck, and what I am avoiding admitting.'],
  ['Truth', 'Blind spot', 'coach', 'Based on my goals and the way I talk about them, what blind spot am I not seeing? What truth would hurt but help me most in the next 90 days?'],
  ['Truth', 'The lies I tell myself', 'coach', 'List the lies I am telling myself about one goal I will name. For each: the uncomfortable truth, and one action that proves I am done with it.'],
  ['Truth', 'Pattern breaker', 'therapist', 'What are the top three self-sabotaging patterns in my relationships, work and life? For each: where it might come from, how it hurts me, and three specific actions to break it.'],
  ['Truth', 'Feedback mirror', 'coach', 'If my best friend, my worst critic and someone I work with each described me in three words, what would they say? Where do they agree? That overlap is my real strength or weakness.'],
  ['Focus', 'Keep or kill', 'coach', 'If I could keep only 20% of what I am doing now and get ten times the results, what should I stop immediately and what should I double down on? Give me a keep versus kill list.'],
  ['Focus', 'Energy map', 'coach', 'Help me map five activities that give me energy and five that drain me, then redesign one ordinary week around it.'],
  ['Focus', 'Tough coach', 'coach', 'Act like a tough coach. I am avoiding a goal. Find the real reason, give me one thing to do in the next 10 minutes, and one line to tell myself when I want to quit.'],
  ['Future', 'Future self', 'future', 'Channel my wisest future self. What would he tell me today, what is he proud I got through, and what three things should I do this week?'],
  ['Future', 'Two futures', 'future', 'Simulate my life 120 days from now if I execute my plan, then if I stay exactly as I am. Be specific about my days, my body, my money and how my kids see me.'],
  ['Future', 'Deathbed test', 'coach', 'If I had 24 hours left, what would I regret wasting time on, and what would I regret never doing? Give me five things to start today.'],
  ['Decisions', 'Council roundtable', 'council', 'I have a decision to make. Run the full Council: five advisors, their disagreements, then the Chairman\'s verdict.'],
  ['Decisions', 'Spending filter', 'coach', 'I am thinking of buying something. Ask me five questions a disciplined, wealthy person would ask first, then tell me whether to buy it and why.'],
  ['Money', 'Income audit', 'coach', 'Look at my skills and situation. What beliefs, excuses and daily habits are keeping my income where it is? Give me a 7-day plan.'],
];
