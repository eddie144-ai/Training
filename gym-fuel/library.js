'use strict';
/* Exercise search, the Iron & Eggs pack, joint tags, plates, gyms and machine-label matching.
   The pack is written for this app. It is not copied from another exercise database.
   Joint tags are guidance for Eddie's left biceps, left hip, knees and lower back, not a diagnosis. */
const Library = (() => {
  const GUIDANCE = 'Guidance only, not medical advice. A GP or physio decides what is safe for you.';
  const TYPICAL_NOTE = 'Typical, please confirm';
  const JOINTS = ['back', 'hip', 'knee', 'bicep'];
  const JOINT_LABEL = { back: 'Back', hip: 'Hip', knee: 'Knee', bicep: 'Left biceps' };
  const RANK = { ok: 0, caution: 1, avoid: 2 };
  const MUSCLES = ['abdominals', 'abductors', 'adductors', 'biceps', 'calves', 'chest', 'forearms', 'glutes', 'hamstrings', 'lats', 'lower back', 'middle back', 'quadriceps', 'shoulders', 'traps', 'triceps'];
  const GEAR = ['barbell', 'dumbbell', 'cable', 'machine', 'body only', 'kettlebells', 'bands', 'e-z curl bar', 'smith', 'other'];
  const TYPICAL_GEAR = [...GEAR];
  const GYMS = [
    { id: 'puregym-shiprow', name: 'PureGym Aberdeen Shiprow' },
    { id: 'puregym-kittybrewster', name: 'PureGym Aberdeen Kittybrewster' },
    { id: 'david-lloyd-aberdeen', name: 'David Lloyd Aberdeen' },
    { id: 'bannatynes-aberdeen', name: "Bannatyne's Aberdeen" },
    { id: 'aberdeen-sports-village', name: 'Aberdeen Sports Village' },
  ];
  const STOP = new Set(['the', 'into', 'for', 'with', 'and', 'from', 'your', 'this', 'that']);

  const exKey = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean)
    .map((w) => (w.endsWith('sses') ? w.slice(0, -2) : w.endsWith('s') && !w.endsWith('ss') && w.length > 3 ? w.slice(0, -1) : w)).join(' ');
  const norm = (s) => exKey(s);
  const words = (s) => norm(s).split(' ').filter(Boolean);

  // Shorthand and near-names. The value is extra search tokens, not a second catalogue.
  const QUERY_TOKEN = {
    rdl: ['romanian', 'deadlift'],
    sldl: ['stiff', 'leg', 'deadlift'],
    ohp: ['overhead', 'press'],
    db: ['dumbbell'],
    bb: ['barbell'],
    kb: ['kettlebell'],
    bp: ['bench', 'press'],
    cgbp: ['close', 'grip', 'bench', 'press'],
    ssb: ['safety', 'bar', 'squat'],
    ghr: ['glute', 'ham'],
    tke: ['terminal', 'knee', 'extension'],
    rfess: ['bulgarian', 'split', 'squat'],
    ez: ['ez'],
  };
  const QUERY_PHRASE = [
    ['pec deck', ['pec', 'deck']],
    ['chest supported', ['chest', 'supported']],
    ['hex bar', ['trap', 'bar']],
    ['trap bar', ['trap', 'bar']],
    ['belt squat', ['belt', 'squat']],
    ['incline walk', ['incline', 'walk']],
    ['bayesian curl', ['bayesian', 'curl']],
    ['bird dog', ['bird', 'dog']],
    ['safety bar', ['safety', 'bar']],
  ];
  const ALSO_BY_NAME = [
    ['Romanian Deadlift', ['rdl']],
    ['Romanian Deadlift from Deficit', ['rdl']],
    ['Standing Military Press', ['ohp', 'overhead']],
    ['Seated Barbell Military Press', ['ohp', 'overhead']],
    ['Dumbbell Shoulder Press', ['ohp', 'overhead']],
    ['Arnold Dumbbell Press', ['ohp', 'overhead']],
    ['Butterfly', ['pec', 'deck']],
    ['Trap Bar Deadlift', ['hex', 'bar']],
    ['Machine Bench Press', ['chest']],
    ['Cable Hammer Curls - Rope Attachment', ['rope']],
    ['Seated Cable Rows', ['seated', 'row']],
    ['Wide-Grip Lat Pulldown', ['lat', 'pulldown']],
    ['Close-Grip Front Lat Pulldown', ['lat', 'pulldown']],
    ['Barbell Hip Thrust', ['hip', 'thrust']],
    ['Face Pull', ['face', 'pull']],
    ['Stiff-Legged Barbell Deadlift', ['sldl']],
    ['Front Barbell Squat', ['front']],
    ['Close-Grip Barbell Bench Press', ['cgbp']],
  ];
  const ALSO = new Map(ALSO_BY_NAME.map(([name, extra]) => [exKey(name), extra]));
  const GROUPS = [
    ['ohp', 'overhead', 'military'],
    ['rdl', 'romanian'],
    ['db', 'dumbbell'],
    ['bb', 'barbell'],
    ['kb', 'kettlebell'],
    ['pec', 'butterfly'],
    ['hex', 'trap'],
  ];

  function grouped(a, b) {
    return GROUPS.some((g) => g.includes(a) && g.includes(b));
  }
  function levenshtein(a, b) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
    for (let i = 1; i <= a.length; i += 1) {
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[a.length][b.length];
  }
  function expandQuery(q) {
    let s = norm(q);
    for (const [phrase, extra] of QUERY_PHRASE) if (s.includes(phrase)) s = `${s} ${extra.join(' ')}`;
    const out = [];
    for (const raw of s.split(' ').filter(Boolean)) {
      if (QUERY_TOKEN[raw]) out.push(...QUERY_TOKEN[raw]);
      else out.push(raw);
    }
    return [...new Set(out.filter((t) => t.length >= 2 && !STOP.has(t)))];
  }
  function tokenHit(q, toks) {
    for (const t of toks) {
      if (t === q || grouped(q, t)) return 3;
      if (t.startsWith(q) || (q.length >= 4 && q.startsWith(t) && t.length >= 4)) return 2;
    }
    if (q.length >= 4) {
      const max = q.length >= 8 ? 2 : 1;
      for (const t of toks) {
        if (Math.abs(t.length - q.length) > max) continue;
        if (levenshtein(q, t) <= max) return 1;
      }
    }
    return 0;
  }

  // Pack rows: id, name, equipment, primary, joints (back,hip,knee,bicep as o/c/a), one coaching line, extra search words.
  // Joint letters are a hint for Eddie's lower back, left hip, knees and left biceps.
  const RAW = [
    ['ie-pendulum-squat', 'Pendulum squat', 'machine', 'quadriceps', 'o,c,c,o', 'Sit in the machine and squat to a depth the knees accept. The pad supports the back.', ''],
    ['ie-belt-squat', 'Belt squat', 'machine', 'quadriceps', 'o,c,c,o', 'The belt loads the hips, so the back is not carrying a bar.', ''],
    ['ie-machine-seated-row', 'Machine seated row', 'machine', 'middle back', 'o,o,o,o', 'Chest on the pad, pull the handles to the ribs.', 'seated row'],
    ['ie-chest-supported-row', 'Chest-supported row', 'machine', 'middle back', 'o,o,o,o', 'Chest on the pad and row. The lower back stays quiet.', 'chest supported row'],
    ['ie-chest-supported-db-row', 'Chest-supported dumbbell row', 'dumbbell', 'middle back', 'o,o,o,o', 'Chest on an incline bench, row the dumbbells to the hips.', 'chest supported row'],
    ['ie-chest-supported-tbar', 'Chest-supported T-bar row', 'machine', 'middle back', 'o,o,o,o', 'Chest on the support, row the T-bar to the lower chest.', ''],
    ['ie-machine-chest-press', 'Machine chest press', 'machine', 'chest', 'o,o,o,o', 'Set the seat so the handles meet the lower chest. Press without a hard lockout.', 'chest press'],
    ['ie-incline-machine-press', 'Incline machine chest press', 'machine', 'chest', 'o,o,o,o', 'The handles travel up and slightly back from the upper chest.', ''],
    ['ie-pec-deck', 'Pec deck', 'machine', 'chest', 'o,o,o,o', 'Upper arms on the pads, bring them together in front of the chest.', 'butterfly pec fly'],
    ['ie-reverse-pec-deck', 'Reverse pec deck', 'machine', 'shoulders', 'o,o,o,o', 'Face the pad and open the arms for the rear shoulders.', 'reverse fly'],
    ['ie-machine-shoulder-press', 'Machine shoulder press', 'machine', 'shoulders', 'o,o,o,o', 'Seated, press the handles up without an excessive lean.', ''],
    ['ie-machine-lateral', 'Machine lateral raise', 'machine', 'shoulders', 'o,o,o,o', 'Pads on the arms, raise to shoulder height.', ''],
    ['ie-assisted-pullup', 'Assisted pull-up', 'machine', 'lats', 'o,o,o,c', 'Use the assist and pull. A neutral grip is kinder on the left biceps.', 'assisted chin'],
    ['ie-assisted-neutral-chin', 'Assisted neutral-grip chin', 'machine', 'lats', 'o,o,o,o', 'Neutral handles on the assist machine, so the left biceps is not fully supinated.', ''],
    ['ie-assisted-dip', 'Assisted dip', 'machine', 'triceps', 'o,o,o,o', 'Stand or kneel on the assist and stop before the shoulder complains.', ''],
    ['ie-seated-dip-machine', 'Seated dip machine', 'machine', 'triceps', 'o,o,o,o', 'Press the handles down. Keep the shoulders packed.', ''],
    ['ie-hip-thrust-machine', 'Hip thrust machine', 'machine', 'glutes', 'o,o,o,o', 'Upper back on the pad, drive the hips up and pause.', ''],
    ['ie-hip-abduction', 'Seated hip abduction', 'machine', 'abductors', 'o,c,o,o', 'Sit tall and press the knees out. Keep the load light on the left hip.', ''],
    ['ie-hip-adduction', 'Seated hip adduction', 'machine', 'adductors', 'o,c,o,o', 'Squeeze the pads together through a range the hip accepts.', ''],
    ['ie-leg-press-short', 'Leg press, short range', 'machine', 'quadriceps', 'o,c,c,o', 'Press, and stop well before the hips and knees fold deep.', 'short range leg press'],
    ['ie-plate-leg-press', 'Plate-loaded leg press', 'machine', 'quadriceps', 'o,c,c,o', 'Same idea as a selectorised leg press: a shorter range if the left knee wants it.', ''],
    ['ie-seated-leg-curl', 'Seated leg curl', 'machine', 'hamstrings', 'o,o,o,o', 'The thigh pad stays down. Curl without the lower back arching.', ''],
    ['ie-lying-leg-curl-machine', 'Lying leg curl machine', 'machine', 'hamstrings', 'o,o,o,o', 'Lie flat and curl, hips down.', ''],
    ['ie-leg-extension-light', 'Leg extension, light', 'machine', 'quadriceps', 'o,o,c,o', 'A light load, short of locking, so the quads work without a deep knee bend.', ''],
    ['ie-standing-calf', 'Standing calf raise machine', 'machine', 'calves', 'o,o,o,o', 'Shoulders under the pads, rise onto the toes and lower under control.', ''],
    ['ie-seated-calf-machine', 'Seated calf raise machine', 'machine', 'calves', 'o,o,o,o', 'Pads on the knees, raise the heels.', ''],
    ['ie-lat-pulldown-machine', 'Lat pulldown machine', 'machine', 'lats', 'o,o,o,c', 'Pull to the upper chest. Use a grip the left biceps accepts.', 'lat pulldown'],
    ['ie-neutral-pulldown', 'Neutral-grip pulldown', 'cable', 'lats', 'o,o,o,o', 'Palms face each other. Pull to the chest without swinging.', 'neutral pulldown'],
    ['ie-cable-hammer', 'Cable hammer curl', 'cable', 'biceps', 'o,o,o,o', 'Rope or a neutral handle, thumbs up. No heavy supinated finish.', 'rope hammer curl'],
    ['ie-bayesian-curl', 'Bayesian curl', 'cable', 'biceps', 'o,o,o,c', 'Face away so the upper arm sits slightly behind you. Keep it light on the left biceps.', 'bayesian'],
    ['ie-iso-row', 'Iso-lateral row', 'machine', 'middle back', 'o,o,o,o', 'Each arm rows on its own. Keep the chest on the pad.', ''],
    ['ie-iso-chest', 'Iso-lateral chest press', 'machine', 'chest', 'o,o,o,o', 'Each handle presses on its own from the chest.', ''],
    ['ie-low-row', 'Low row machine', 'machine', 'middle back', 'o,o,o,o', 'Sit tall and pull the low handles to the stomach.', ''],
    ['ie-diverging-row', 'Diverging seated row', 'machine', 'middle back', 'o,o,o,o', 'The handles travel out as you pull. Use the chest pad when the machine has one.', ''],
    ['ie-neutral-seated-row', 'Neutral-grip seated row', 'cable', 'middle back', 'o,o,o,o', 'Neutral handles, pull to the ribs, chest up.', ''],
    ['ie-rotary-torso', 'Rotary torso', 'machine', 'abdominals', 'c,o,o,o', 'A light turn. Skip it when the lower back is irritable.', ''],
    ['ie-back-extension-45', '45° back extension, light', 'machine', 'lower back', 'c,o,o,o', 'A light hinge on the 45° bench. Stop if the lower back grabs.', 'back extension'],
    ['ie-glute-kickback', 'Glute kickback machine', 'machine', 'glutes', 'o,o,o,o', 'Drive the leg back through the heel. A small range is enough.', ''],
    ['ie-smith-squat', 'Smith machine squat', 'smith', 'quadriceps', 'c,c,c,o', 'Feet slightly forward. Squat to a box or a high depth.', 'smith squat'],
    ['ie-smith-bench', 'Smith machine bench press', 'smith', 'chest', 'o,o,o,o', 'Bench under the bar and press from the chest.', ''],
    ['ie-cable-lateral', 'Cable lateral raise', 'cable', 'shoulders', 'o,o,o,o', 'The cable comes from the other side. Raise the arm to shoulder height.', ''],
    ['ie-straight-arm-pulldown', 'Straight-arm cable pulldown', 'cable', 'lats', 'o,o,o,o', 'Arms stay nearly straight. Pull the bar down to the thighs.', ''],
    ['ie-cable-pull-through', 'Cable pull-through', 'cable', 'glutes', 'o,o,o,o', 'Face away, hinge a short way and drive the hips through.', ''],
    ['ie-bulgarian', 'Bulgarian split squat', 'dumbbell', 'quadriceps', 'c,a,c,o', 'Rear foot up, a short step. Keep the range small for the left hip and knee.', 'rear foot elevated split squat rfess'],
    ['ie-step-up-low', 'Step-up, low box', 'dumbbell', 'quadriceps', 'o,c,c,o', 'Use a low box. Drive through the front heel.', 'step up'],
    ['ie-goblet-box', 'Goblet box squat', 'dumbbell', 'quadriceps', 'o,c,c,o', 'One dumbbell at the chest, sit back to a box.', ''],
    ['ie-chest-supported-rear', 'Chest-supported rear delt raise', 'dumbbell', 'shoulders', 'o,o,o,o', 'Chest on an incline, raise the arms out to the side.', ''],
    ['ie-safety-bar-squat', 'Safety-bar squat', 'barbell', 'quadriceps', 'c,c,c,o', 'The cambered bar sits on the shoulders with the hands forward. A high box if the knees want it.', 'ssb'],
    ['ie-trap-bar-deadlift', 'Trap-bar deadlift', 'other', 'hamstrings', 'c,o,c,o', 'Handles at the sides, so the back stays more upright than a straight bar.', 'hex bar deadlift hex bar'],
    ['ie-landmine-press', 'Landmine press', 'barbell', 'shoulders', 'c,o,o,o', 'One end of the bar fixed, press up and slightly forward.', ''],
    ['ie-landmine-squat', 'Landmine squat', 'barbell', 'quadriceps', 'o,c,c,o', 'Hold the end of the bar at the chest and squat to a comfortable depth.', ''],
    ['ie-spanish-squat', 'Spanish squat', 'bands', 'quadriceps', 'o,o,o,o', 'A band behind the knees, anchored in front. Sit down with the shins staying upright.', ''],
    ['ie-tke', 'Terminal knee extension', 'bands', 'quadriceps', 'o,o,o,o', 'Band behind the knee. Straighten the last part of the knee.', 'tke'],
    ['ie-band-pull-apart', 'Band pull-apart', 'bands', 'shoulders', 'o,o,o,o', 'Hold the band in front and pull it apart to the chest.', ''],
    ['ie-band-abduction', 'Band hip abduction', 'bands', 'abductors', 'o,o,o,o', 'Band above the knees. Step side to side or open the knees.', ''],
    ['ie-monster-walk', 'Band monster walk', 'bands', 'abductors', 'o,c,o,o', 'Band above the knees or on the feet. Short steps sideways.', ''],
    ['ie-bird-dog', 'Bird dog', 'body only', 'abdominals', 'o,o,o,o', 'Hands and knees. Reach the opposite arm and leg without twisting the lower back.', 'bird dog'],
    ['ie-mcgill-curl', 'McGill curl-up', 'body only', 'abdominals', 'o,o,o,o', 'One knee bent, hands under the lower back, lift the head and shoulders only a little.', 'mcgill curl mcgill crunch'],
    ['ie-copenhagen', 'Copenhagen plank', 'body only', 'adductors', 'o,c,o,o', 'Side plank with the top leg on a bench. A short hold. The left hip decides the range.', 'copenhagen'],
    ['ie-nordic', 'Nordic hamstring curl', 'body only', 'hamstrings', 'o,o,c,o', 'Ankles held, lower forward, and push back up with the hands if needed.', 'nordic curl'],
    ['ie-reverse-nordic', 'Reverse Nordic curl', 'body only', 'quadriceps', 'o,o,c,o', 'Kneel and lean back a short way. The left knee decides how far.', ''],
    ['ie-wall-sit', 'Wall sit', 'body only', 'quadriceps', 'o,o,c,o', 'Back on the wall. Keep the thighs above parallel if the knees prefer it.', 'wall squat'],
    ['ie-glute-bridge', 'Glute bridge', 'body only', 'glutes', 'o,o,o,o', 'On the floor, drive the hips up and pause. Ribs stay down.', ''],
    ['ie-side-plank', 'Side plank', 'body only', 'abdominals', 'o,o,o,o', 'From the knee or the foot. Hips stay up.', ''],
    ['ie-clamshell', 'Clamshell', 'body only', 'abductors', 'o,o,o,o', 'On the side, knees bent, open the top knee without rolling the hips back.', ''],
    ['ie-tibialis', 'Tibialis raise', 'body only', 'quadriceps', 'o,o,o,o', 'Heels down, raise the toes.', 'tib raise'],
    ['ie-single-leg-hip-thrust', 'Single-leg hip thrust', 'body only', 'glutes', 'o,c,o,o', 'Shoulders on a bench, one heel down, drive the hip up. A small range on the left hip.', ''],
    ['ie-prone-y', 'Prone Y raise', 'body only', 'shoulders', 'o,o,o,o', 'Face down, thumbs up, lift the arms into a Y.', ''],
    ['ie-wall-slide', 'Wall slide', 'body only', 'shoulders', 'o,o,o,o', 'Back and arms on the wall. Slide the hands up as far as the shoulders allow.', ''],
    ['ie-floor-press', 'Floor press', 'dumbbell', 'chest', 'o,o,o,o', 'Press from the floor. The elbows stop on the floor, so the range stays short.', ''],
    ['ie-half-kneeling-press', 'Half-kneeling one-arm press', 'dumbbell', 'shoulders', 'o,c,o,o', 'One knee down, press the dumbbell. The down knee is the left hip\'s call.', ''],
    ['ie-slider-curl', 'Supine hamstring curl, slider', 'body only', 'hamstrings', 'o,o,o,o', 'Heels on sliders or towels. Curl the heels in while the hips stay up.', ''],
    ['ie-hip-airplane', 'Hip airplane', 'body only', 'glutes', 'o,c,o,o', 'Stand on one leg and open the hip slowly. A balance drill, not a loaded lift.', ''],
    ['ie-dead-hang', 'Dead hang', 'body only', 'lats', 'o,o,o,c', 'Hang from a bar. Bend the knees if the shoulders need it. A short hold.', ''],
    ['ie-incline-walk', 'Incline treadmill walk', 'machine', 'quadriceps', 'o,o,o,o', 'A steep easy walk for the cut. Hands off the rails when balance allows.', 'incline walk'],
    ['ie-outdoor-walk', 'Walk, outdoor', 'other', 'quadriceps', 'o,o,o,o', 'An easy walk. It counts as light conditioning, not a leg session.', ''],
    ['ie-sled-push', 'Sled push', 'other', 'quadriceps', 'o,c,c,o', 'Short steps, arms long. Stop if a knee complains.', ''],
    ['ie-sled-drag', 'Reverse sled drag', 'other', 'quadriceps', 'o,o,o,o', 'Walk backwards dragging the sled. The knees stay quiet.', 'reverse sled'],
    ['ie-machine-shrug', 'Machine shrug', 'machine', 'traps', 'o,o,o,o', 'Hold the handles and shrug. The back stays tall.', ''],
  ];

  const CODE = { o: 'ok', c: 'caution', a: 'avoid' };
  function jointsFromCode(code) {
    const [back, hip, knee, bicep] = String(code || 'o,o,o,o').split(',');
    return { back: CODE[back] || 'ok', hip: CODE[hip] || 'ok', knee: CODE[knee] || 'ok', bicep: CODE[bicep] || 'ok' };
  }
  const PACK = RAW.map(([id, name, equipment, primary, joints, step, also]) => ({
    id,
    name,
    level: /bird|mcgill|wall|clamshell|bridge|plank|spanish|tibialis|slide|airplane|walk|hang|pull-apart|abduction/.test(name.toLowerCase()) ? 'beginner' : 'intermediate',
    equipment,
    primary: [primary],
    secondary: [],
    category: /walk/.test(name.toLowerCase()) ? 'cardio' : 'strength',
    mechanic: /curl|raise|deck|extension|abduction|adduction|shrug|hang/.test(name.toLowerCase()) ? 'isolation' : 'compound',
    steps: step ? [step] : [],
    images: [],
    joints: jointsFromCode(joints),
    also: also ? also.split(' ').filter(Boolean) : [],
    source: 'pack',
  }));

  function hasWord(name, ...list) {
    const set = new Set(words(name));
    return list.some((w) => set.has(w));
  }
  function hasPhrase(name, phrase) {
    return ` ${norm(name)} `.includes(` ${phrase} `);
  }
  function jointTags(ex) {
    const name = ex?.name || '';
    const n = norm(name);
    const eq = String(ex?.equipment || '').toLowerCase();
    const cat = String(ex?.category || '').toLowerCase();
    const prim = (ex?.primary || []).join(' ').toLowerCase();
    if (cat === 'stretching') return { back: 'ok', hip: 'ok', knee: 'ok', bicep: 'ok' };
    let back = 'ok';
    let hip = 'ok';
    let knee = 'ok';
    let bicep = 'ok';
    if (hasPhrase(n, 'good morning') || (hasWord(name, 'deadlift') && !hasWord(name, 'romanian', 'trap') && !n.includes('stiff'))) back = 'avoid';
    else if (hasPhrase(n, 'bent over') && hasWord(name, 'row') && !n.includes('chest supported') && eq !== 'machine') back = 'avoid';
    else if (/\b(squat|overhead|military|clean|snatch|jerk|deadlift|hinge)\b/.test(n) && !n.includes('box') && !n.includes('belt') && !n.includes('goblet')) back = 'caution';
    if (n.includes('chest supported') || (eq === 'machine' && /row|pulldown|press|deck/.test(n) && !/overhead|military|squat/.test(n))) back = 'ok';
    if (cat === 'plyometrics' || hasWord(name, 'jump', 'pistol') || hasPhrase(n, 'sissy squat') || hasPhrase(n, 'depth jump')) knee = 'avoid';
    else if (hasWord(name, 'lunge', 'squat') || n.includes('split squat') || n.includes('leg press') || n.includes('step up') || n.includes('leg extension') || n.includes('hack') || n.includes('nordic') || n.includes('wall sit') || n.includes('pendulum') || n.includes('bulgarian')) knee = 'caution';
    if (n.includes('short range') || n.includes('spanish squat') || n.includes('terminal knee') || n.includes('tibialis') || n.includes('leg curl') || n.includes('hamstring curl')) knee = knee === 'avoid' ? 'caution' : 'ok';
    if (hasWord(name, 'pistol') || hasPhrase(n, 'sissy squat') || n.includes('walking lunge') || n.includes('bulgarian') || n.includes('cossack')) hip = 'avoid';
    else if (hasWord(name, 'lunge', 'squat') || n.includes('leg press') || n.includes('step up') || hasWord(name, 'deadlift')) hip = 'caution';
    if (n.includes('glute bridge') || n.includes('hip thrust') || n.includes('bird dog') || n.includes('clamshell') || n.includes('side plank') || n.includes('box squat') || n.includes('short range')) hip = hip === 'avoid' ? 'caution' : 'ok';
    const curl = hasWord(name, 'curl') && (prim.includes('bicep') || n.includes('bicep') || n.includes('curl'));
    if (hasWord(name, 'preacher', 'zottman', 'chin') || hasPhrase(n, 'spider curl') || hasPhrase(n, 'drag curl') || hasPhrase(n, 'barbell curl') || hasPhrase(n, 'concentration curl') || n.includes('bicep pulldown') || hasPhrase(n, 'wall curl')) bicep = 'avoid';
    else if (curl && !hasWord(name, 'hammer') && !n.includes('neutral')) bicep = 'caution';
    if (hasWord(name, 'hammer') || n.includes('neutral grip') || hasWord(name, 'tricep') || n.includes('triceps')) bicep = 'ok';
    if (cat === 'cardio' && !hasWord(name, 'jump')) { knee = 'ok'; hip = 'ok'; }
    return { back, hip, knee, bicep };
  }
  function normalJoints(j) {
    const out = {};
    for (const a of JOINTS) out[a] = RANK[j?.[a]] != null ? j[a] : 'ok';
    return out;
  }
  function worst(j) {
    return Math.max(...JOINTS.map((a) => RANK[j?.[a]] ?? 1));
  }
  function prepare(item) {
    item.primary = Array.isArray(item.primary) ? item.primary : [];
    item.secondary = Array.isArray(item.secondary) ? item.secondary : [];
    item.steps = Array.isArray(item.steps) ? item.steps : [];
    item.images = Array.isArray(item.images) ? item.images : [];
    item.key = exKey(item.name);
    const extra = [...(item.also || []), ...(ALSO.get(item.key) || [])];
    item.toks = [...new Set([...words(item.name).filter((t) => !STOP.has(t)), ...extra.map((t) => exKey(t)).join(' ').split(' ').filter(Boolean)])];
    item.joints = item.joints ? normalJoints(item.joints) : jointTags(item);
    item.source = item.source || 'free';
    return item;
  }
  function search(items, query, opts = {}) {
    const raw = norm(query);
    const q = expandQuery(query);
    if (!raw || !q.length) return [];
    const mus = opts.muscle || '';
    const eq = opts.equipment || '';
    const kind = !!opts.kind;
    const mine = !!opts.mine;
    const hits = [];
    for (const item of items || []) {
      if (mus && !(item.primary || []).includes(mus)) continue;
      if (eq && item.equipment !== eq) continue;
      if (mine && item.source !== 'custom') continue;
      if (kind && worst(item.joints) >= 2) continue;
      let score = 0;
      let ok = true;
      for (const t of q) {
        const h = tokenHit(t, item.toks || []);
        if (!h) { ok = false; break; }
        score += h;
      }
      if (!ok) continue;
      const name = norm(item.name);
      if (name === raw) score += 100;
      else if (raw.length > 2 && name.startsWith(raw)) score += 20;
      if (item.source === 'custom') score += 8;
      if (item.source === 'pack') score += 3;
      hits.push({ item, score });
    }
    hits.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
    return hits.map((h) => h.item);
  }

  function guess(name) {
    const n = norm(name);
    let equipment = 'other';
    if (/\b(dumbbell|db)\b/.test(n)) equipment = 'dumbbell';
    else if (/\b(barbell|bb)\b/.test(n)) equipment = 'barbell';
    else if (/\bcable\b/.test(n)) equipment = 'cable';
    else if (/\bsmith\b/.test(n)) equipment = 'smith';
    else if (/\b(machine|deck|leg press)\b/.test(n)) equipment = 'machine';
    else if (/\b(band|banded)\b/.test(n)) equipment = 'bands';
    else if (/\b(kettlebell|kb)\b/.test(n)) equipment = 'kettlebells';
    else if (/\b(plank|push up|pushup|bird|wall sit|nordic|bridge|hang)\b/.test(n)) equipment = 'body only';
    let primary = 'quadriceps';
    if (/curl|bicep/.test(n) && !/leg curl|hamstring|nordic/.test(n)) primary = 'biceps';
    else if (/tricep|pushdown|dip/.test(n)) primary = 'triceps';
    else if (/deadlift|rdl|hinge|romanian|nordic|leg curl|hamstring/.test(n)) primary = 'hamstrings';
    else if (/row|pulldown|pull up|chin/.test(n)) primary = 'middle back';
    else if (/shoulder|lateral|overhead|military|ohp|rear delt/.test(n)) primary = 'shoulders';
    else if (/(bench|chest|pec|fly|floor press)/.test(n)) primary = 'chest';
    else if (/calf/.test(n)) primary = 'calves';
    else if (/hip thrust|glute|bridge|abduction|kickback/.test(n)) primary = 'glutes';
    else if (/plank|crunch|curl up|dead bug|bird|pallof|mcgill/.test(n)) primary = 'abdominals';
    else if (/shrug|farmer|carry/.test(n)) primary = 'traps';
    else if (/adduction|copenhagen/.test(n)) primary = 'adductors';
    else if (/walk|treadmill|sled/.test(n)) primary = 'quadriceps';
    const type = /plank|wall sit|hold|hang|bird|curl-up|curl up/.test(n) ? 'time' : (equipment === 'body only' && !/curl|squat|lunge|press|push/.test(n) ? 'bodyweight' : 'weight');
    const category = /walk|treadmill/.test(n) ? 'cardio' : 'strength';
    const draft = { name: String(name || '').trim(), equipment, primary: [primary], category, mechanic: 'compound' };
    return {
      name: draft.name,
      equipment,
      primary,
      category,
      type,
      joints: jointTags(draft),
      sets: 3,
      reps: type === 'time' ? '20–40 s' : '8–12',
    };
  }

  function requirement(ex) {
    const n = norm(ex?.name || '');
    if (n.includes('smith') || ex?.equipment === 'smith') return 'smith';
    if (n.includes('kettlebell')) return 'kettlebells';
    if (n.includes('ez bar') || n.includes('ez curl')) return 'e-z curl bar';
    const eq = String(ex?.equipment || '').toLowerCase();
    if (eq === 'kettlebell' || eq === 'kettlebells') return 'kettlebells';
    if (!eq) return 'other';
    return eq;
  }
  function gymHas(ex, gym) {
    if (!gym) return true;
    if (ex?.id && (gym.machines || []).includes(ex.id)) return true;
    const gear = new Set(gym.gear || []);
    return gear.has(requirement(ex));
  }
  function findSwap(row, gym, items) {
    const want = new Set(row.item?.primary || []);
    let best = null;
    let score = -1;
    for (const opt of row.swaps || []) {
      const cand = (items || []).find((it) => (opt.libId && it.id === opt.libId) || norm(it.name) === norm(opt.name));
      if (!cand || !gymHas(cand, gym) || worst(cand.joints) >= 2) continue;
      const sc = 50 - worst(cand.joints) * 5;
      if (sc > score) { score = sc; best = cand; }
    }
    for (const cand of items || []) {
      if (row.item && cand.id === row.item.id) continue;
      if (norm(cand.name) === norm(row.name)) continue;
      if (want.size && !(cand.primary || []).some((p) => want.has(p))) continue;
      if (!gymHas(cand, gym) || worst(cand.joints) >= 2) continue;
      const sc = 20 - worst(cand.joints) * 5 + (cand.equipment && cand.equipment === row.item?.equipment ? 1 : 0);
      if (sc > score) { score = sc; best = cand; }
    }
    return best;
  }
  // rows: { name, item, swaps: [{ name, libId }] }
  // A swap is proposed when the gym lacks the kit or a joint tag is avoid. Caution stays unless he ticks it.
  function fitPlan(rows, gym, items) {
    return (rows || []).map((row) => {
      const item = row.item || { name: row.name, ...guess(row.name), primary: [guess(row.name).primary], joints: guess(row.name).joints };
      const joints = item.joints || jointTags(item);
      const present = gymHas(item, gym);
      const level = worst(joints);
      const enriched = { ...row, item };
      if (present && level < 2) {
        return { name: row.name, action: 'keep', reason: level === 1 ? 'caution' : 'ok', joints, replacement: level === 1 ? findSwap(enriched, gym, items) : null };
      }
      const replacement = findSwap(enriched, gym, items);
      return {
        name: row.name,
        action: replacement ? 'swap' : 'keep',
        reason: !present ? 'missing' : 'avoid',
        joints,
        replacement,
      };
    });
  }

  const LABEL_HINTS = [
    'pec deck', 'butterfly', 'leg press', 'chest press', 'seated row', 'lat pulldown', 'lat pull down',
    'leg extension', 'leg curl', 'shoulder press', 'hip abduction', 'hip adduction', 'calf raise',
    'hack squat', 'pendulum', 'belt squat', 'pull up', 'chin up', 'chest supported', 'bicep curl',
    'tricep', 'adductor', 'abductor', 'low row', 'incline press', 'smith', 'hammer curl', 't-bar',
  ];
  const BRANDS = ['life fitness', 'technogym', 'matrix', 'panatta', 'cybex', 'precor', 'hammer strength', 'hoist', 'nautilus', 'star trac', 'startrac', 'pulse', 'gym80', 'body-solid', 'body solid', 'icarian', 'arsenal'];
  function titleFromOcr(text) {
    const lines = String(text || '').split(/\n/).map((l) => l.replace(/[^A-Za-z0-9 &'./-]/g, ' ').replace(/\s+/g, ' ').trim()).filter((l) => l.length >= 4 && l.length <= 42);
    const brand = new Set(BRANDS);
    const good = lines.filter((l) => !brand.has(l.toLowerCase()) && /[A-Za-z]{3}/.test(l));
    good.sort((a, b) => b.length - a.length);
    return good[0] || '';
  }
  function matchMachineText(text, items) {
    const n = norm(text);
    const hints = LABEL_HINTS.filter((h) => n.includes(norm(h)));
    const seen = new Set();
    const matches = [];
    for (const hint of hints) {
      for (const item of search(items, hint, {}).slice(0, 2)) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        matches.push(item);
      }
    }
    return { hints, matches: matches.slice(0, 6), title: titleFromOcr(text) };
  }

  function plates(targetKg, barKg, list) {
    const target = Number(targetKg);
    const bar = Number(barKg);
    const avail = [...new Set((list || []).map(Number).filter((n) => n > 0))].sort((a, b) => b - a);
    if (!(target > 0)) return { ok: false, reason: 'Enter the weight you want on the bar.' };
    if (!(bar >= 0)) return { ok: false, reason: 'Enter the bar weight.' };
    const side = Math.round(((target - bar) / 2) * 1000);
    if (side < 0) return { ok: false, reason: 'That is lighter than the bar.' };
    const textOf = (used) => used.map((u) => (u.n > 1 ? `${u.n}×${strip(u.kg)}` : strip(u.kg))).join(' + ');
    const loadOf = (used) => used.reduce((a, u) => a + u.kg * u.n, 0);
    if (side === 0) return { ok: true, bar, target, eachSide: 0, perSide: [], leftover: 0, text: `Empty bar, ${strip(bar)} kg.` };
    let rem = side;
    const used = [];
    for (const p of avail) {
      const g = Math.round(p * 1000);
      const n = Math.floor(rem / g);
      if (n > 0) { used.push({ kg: p, n }); rem -= n * g; }
    }
    const each = loadOf(used);
    const total = Math.round((bar + each * 2) * 1000) / 1000;
    if (rem === 0) {
      return { ok: true, bar, target, eachSide: each, perSide: used, leftover: 0, text: `Each side: ${textOf(used)}. ${strip(bar)} kg bar + ${strip(each * 2)} kg of plates = ${strip(total)} kg.` };
    }
    return { ok: false, bar, target, eachSide: each, perSide: used, leftover: rem / 1000, text: `These plates can't make ${strip(target)} kg. Closest under is ${strip(total)} kg. Each side: ${textOf(used) || 'no plates'}.` };
  }
  function strip(n) {
    const x = Math.round(Number(n) * 1000) / 1000;
    return Number.isInteger(x) ? String(x) : String(x);
  }

  function seedGyms() {
    return GYMS.map((g) => ({ id: g.id, name: g.name, gear: [...TYPICAL_GEAR], machines: [], typical: true }));
  }
  function cleanGear(list) {
    const ok = new Set(GEAR);
    return [...new Set((Array.isArray(list) ? list : []).map((x) => String(x)))].filter((x) => ok.has(x));
  }
  function cleanGym(g) {
    if (!g || typeof g !== 'object') return null;
    const name = String(g.name || '').trim().slice(0, 80);
    if (!name) return null;
    const machines = [...new Set((Array.isArray(g.machines) ? g.machines : []).map((x) => String(x).slice(0, 80)).filter(Boolean))].slice(0, 80);
    return { id: String(g.id || name).slice(0, 80), name, gear: cleanGear(g.gear), machines, typical: !!g.typical };
  }
  function ensureGyms(list) {
    const out = (Array.isArray(list) ? list : []).map(cleanGym).filter(Boolean);
    for (const seed of seedGyms()) if (!out.some((g) => g.id === seed.id)) out.push(seed);
    return out;
  }
  function cleanJoints(j) {
    return normalJoints(j || {});
  }
  function cleanCustom(x) {
    if (!x || typeof x !== 'object') return null;
    const name = String(x.name || '').trim().slice(0, 80);
    if (!name) return null;
    const primary = (Array.isArray(x.primary) ? x.primary : [x.primary]).map((s) => String(s || '').trim()).filter(Boolean).slice(0, 3);
    const equipment = GEAR.includes(x.equipment) ? x.equipment : (String(x.equipment || 'other').slice(0, 40) || 'other');
    return {
      id: String(x.id || '').slice(0, 40) || '',
      name,
      equipment,
      primary: primary.length ? primary : ['quadriceps'],
      secondary: (Array.isArray(x.secondary) ? x.secondary : []).map((s) => String(s).slice(0, 40)).slice(0, 3),
      category: String(x.category || 'strength').slice(0, 20),
      mechanic: String(x.mechanic || 'compound').slice(0, 20),
      type: ['weight', 'bodyweight', 'time'].includes(x.type) ? x.type : 'weight',
      joints: cleanJoints(x.joints),
      steps: (Array.isArray(x.steps) ? x.steps : []).map((s) => String(s).slice(0, 240)).filter(Boolean).slice(0, 6),
      photoId: typeof x.photoId === 'string' ? x.photoId.slice(0, 80) : '',
      level: 'custom',
      images: [],
      source: 'custom',
    };
  }
  function cleanAliases(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [k, v] of Object.entries(raw)) {
      const a = exKey(k);
      const b = exKey(v);
      if (a && b && a !== b && a.length < 80 && b.length < 80) out[a] = b;
    }
    for (const k of Object.keys(out)) {
      const seen = new Set();
      let cur = k;
      while (out[cur] && !seen.has(cur)) { seen.add(cur); cur = out[cur]; }
      if (seen.has(cur)) delete out[k];
    }
    return out;
  }
  function cleanPhotos(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [k, v] of Object.entries(raw)) {
      if (typeof k === 'string' && typeof v === 'string' && k && v) out[k.slice(0, 80)] = v.slice(0, 80);
    }
    return out;
  }

  return {
    GUIDANCE, TYPICAL_NOTE, JOINTS, JOINT_LABEL, MUSCLES, GEAR, TYPICAL_GEAR, GYMS, PACK,
    exKey, norm, prepare, search, expandQuery, guess, jointTags, worst, jointsFromCode,
    plates, gymHas, requirement, fitPlan, matchMachineText, titleFromOcr,
    seedGyms, ensureGyms, cleanGym, cleanCustom, cleanAliases, cleanPhotos, cleanJoints,
  };
})();
