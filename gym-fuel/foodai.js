'use strict';
/* Photo food logging with Claude: a photo of a meal, drink, snack, nutrition label or menu goes to the
   Anthropic API, which returns each food with an estimated weight and its calories and macros.
   - Your own Anthropic API key, entered in Body → Settings. It's kept in this browser only (never in backups) and
     sent only to api.anthropic.com. This is a static app with no server, so the official SDK runs in the browser
     with `dangerouslyAllowBrowser`, which is safe here only because the key is the user's own.
   - The SDK (pinned) is loaded from jsDelivr the first time it's needed. */
const FoodAI = (() => {
  const SDK = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.132.0/+esm';
  const KEY = 'gymfuel.anthropicKey', MODEL = 'gymfuel.aiModel';
  const MODELS = [
    ['claude-opus-5-5', 'Claude Opus 5.5 (most accurate)'],
    ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (about half the cost)'],
    ['claude-haiku-5-5', 'Claude Haiku 5.5 (cheapest)'],
  ];
  // Opus 5.5 and Sonnet 5.5 take the server-side refusal fallback; Haiku 5.5 has none.
  const FALLBACK = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);
  const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  const read = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
  const write = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* storage blocked */ } };
  const getKey = () => read(KEY);
  const setKey = (v) => write(KEY, String(v || '').trim());
  const getModel = () => (MODELS.some(([m]) => m === read(MODEL)) ? read(MODEL) : MODELS[0][0]);
  const setModel = (v) => write(MODEL, MODELS.some(([m]) => m === v) ? v : '');

  let sdkP = null;
  const loadSdk = () => (sdkP ||= import(SDK).catch((e) => { sdkP = null; throw e; }));

  const SCHEMA = {
    type: 'object', additionalProperties: false, required: ['kind', 'items', 'notes'],
    properties: {
      kind: { type: 'string', enum: ['meal', 'drink', 'label', 'menu', 'not_food'] },
      items: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['name', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'confidence'],
          properties: {
            name: { type: 'string' }, grams: { type: 'number' }, kcal: { type: 'number' },
            protein_g: { type: 'number' }, carbs_g: { type: 'number' }, fat_g: { type: 'number' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
        },
      },
      notes: { type: 'string' },
    },
  };

  const SYSTEM = `You estimate nutrition for a personal food log from one photo. The photo may show a plated meal, a snack, a drink, a packet, a nutrition label or a menu.

List each separately eaten food as an item: a short name, the weight in grams as served, and calories, protein, carbohydrate and fat for that weight. Use standard food-composition values (UK/EU products where it matters). Count cooking oil, butter, sauces and dressings that you can see, or that the dish is normally made with, as their own items, because they are where most estimates go wrong.

If a nutrition label is readable, use its printed numbers exactly: one item for one serving as the label defines it, with grams set to the serving size, and put the per-100 g values in notes. For a menu, give the dish the user's note names, or the single most likely dish if there is no note. If the user's note gives weights, amounts or ingredients, they override what you see.

confidence is high when the weight is printed or stated, medium for a clearly visible portion, low when the portion or ingredients are hidden or guessed. If nothing edible is shown, return kind not_food and no items. notes: one or two short sentences on the assumptions the user should check (for example "assumed 1 tbsp olive oil"), or an empty string. Give single numbers, not ranges.`;

  const toBase64 = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

  // Returns { ok: true, result: { kind, items, notes }, model } or { ok: false, error } with a message for the user.
  async function analyse(blob, note) {
    const apiKey = getKey();
    if (!apiKey) return { ok: false, error: 'Add your Anthropic API key in Body → Settings first.' };
    const mediaType = IMAGE_TYPES.includes(blob.type) ? blob.type : '';
    if (!mediaType) return { ok: false, error: 'This photo format can\'t be read. Take the photo in JPEG (most phones do) and try again.' };
    let mod;
    try { mod = await loadSdk(); } catch { return { ok: false, error: 'Couldn\'t load the Claude library. Photo logging needs an internet connection.' }; }
    const Anthropic = mod.default;
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    const model = getModel();
    const text = String(note || '').trim();
    const params = {
      model,
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: await toBase64(blob) } },
        { type: 'text', text: text ? `What I ate, in my words: ${text}` : 'Log what is in this photo.' },
      ] }],
    };
    let res;
    try {
      res = FALLBACK.has(model)
        ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
        : await client.messages.create(params);
    } catch (e) {
      if (e instanceof mod.AuthenticationError) return { ok: false, error: 'Anthropic didn\'t accept the API key. Check it in Body → Settings.' };
      if (e instanceof mod.PermissionDeniedError) return { ok: false, error: 'This API key isn\'t allowed to use that model. Pick another model in Settings.' };
      if (e instanceof mod.RateLimitError) return { ok: false, error: 'Too many requests, or the account is out of credit. Wait a minute and try again.' };
      if (e instanceof mod.BadRequestError) return { ok: false, error: `Anthropic couldn't process this request: ${e.message}` };
      if (e instanceof mod.APIConnectionError) return { ok: false, error: 'Couldn\'t reach Anthropic. Check your connection.' };
      if (e instanceof mod.APIError) return { ok: false, error: `Anthropic returned an error (${e.status ?? 'unknown'}). Try again shortly.` };
      return { ok: false, error: 'Something went wrong reading the photo. Try again.' };
    }
    if (res.stop_reason === 'refusal') return { ok: false, error: 'Claude declined to read this photo. Enter the food yourself instead.' };
    if (res.stop_reason === 'max_tokens') return { ok: false, error: 'The answer was cut short. Try again, or crop the photo to the food.' };
    const out = res.content.find((b) => b.type === 'text');
    let result;
    try { result = JSON.parse(out?.text || ''); } catch { return { ok: false, error: 'Claude\'s answer couldn\'t be read. Try again.' }; }
    const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 10) / 10 : 0);
    result.items = (Array.isArray(result.items) ? result.items : []).map((it) => ({
      name: String(it.name || 'Food').slice(0, 80), grams: n(it.grams), kcal: Math.round(n(it.kcal)),
      p: n(it.protein_g), c: n(it.carbs_g), f: n(it.fat_g), confidence: ['high', 'medium', 'low'].includes(it.confidence) ? it.confidence : 'low',
    })).filter((it) => it.kcal > 0 || it.p > 0 || it.c > 0 || it.f > 0);
    return { ok: true, result, model: res.model };
  }

  return { MODELS, getKey, setKey, getModel, setModel, analyse };
})();
