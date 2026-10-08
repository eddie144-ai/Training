'use strict';
/* Photo food logging: a photo of a meal, drink, snack, nutrition label or menu goes to an AI model, which returns
   each food with an estimated weight and its calories and macros. Two providers, each with the user's own key:
   - Gemini (Google, free tier): the key is the one Deliberation Council saves on this phone (`gemini_api_key`, same
     site, so it's shared), or one entered here. Called with fetch, as Deliberation Council does.
   - Claude (Anthropic, paid): the key entered in Body → Settings. This is a static app with no server, so the official
     SDK runs in the browser with `dangerouslyAllowBrowser`, which is safe here only because the key is the user's own.
     The SDK (pinned) is loaded from jsDelivr the first time it's needed.
   Keys are kept in this browser only, outside the app data (so never in backups), and sent only to their provider. */
const FoodAI = (() => {
  const SDK = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.132.0/+esm';
  const KEY = 'gymfuel.anthropicKey', MODEL = 'gymfuel.aiModel', PROVIDER = 'gymfuel.aiProvider';
  // Shared with Deliberation Council's web build (AsyncStorage keeps plain strings in localStorage).
  const GEMINI_KEY = 'gemini_api_key', COUNCIL_GEMINI_MODEL = 'council.geminiModel', GEMINI_MODEL = 'gymfuel.geminiModel';
  const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
  const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
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
  const getGeminiKey = () => read(GEMINI_KEY).trim();
  const setGeminiKey = (v) => write(GEMINI_KEY, String(v || '').trim());
  const getGeminiModel = () => read(GEMINI_MODEL).trim() || read(COUNCIL_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
  const setGeminiModel = (v) => { const m = String(v || '').trim(); write(GEMINI_MODEL, m && m !== DEFAULT_GEMINI_MODEL ? m : ''); };
  // The chosen provider; with no choice made, Gemini when its key is on the phone (free), else Claude.
  const getProvider = () => { const p = read(PROVIDER); return p === 'gemini' || p === 'claude' ? p : getGeminiKey() && !getKey() ? 'gemini' : 'claude'; };
  const setProvider = (v) => write(PROVIDER, v === 'gemini' || v === 'claude' ? v : '');
  const providerName = () => (getProvider() === 'gemini' ? 'Gemini' : 'Claude');
  const ready = () => !!(getProvider() === 'gemini' ? getGeminiKey() : getKey());

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

  const userText = (note) => { const t = String(note || '').trim(); return t ? `What I ate, in my words: ${t}` : 'Log what is in this photo.'; };
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 10) / 10 : 0);
  // Same clean-up for either provider: numbers rounded and non-negative, unknown confidence = low, empty items dropped.
  function tidy(result) {
    result.items = (Array.isArray(result.items) ? result.items : []).map((it) => ({
      name: String(it.name || 'Food').slice(0, 80), grams: n(it.grams), kcal: Math.round(n(it.kcal)),
      p: n(it.protein_g), c: n(it.carbs_g), f: n(it.fat_g), confidence: ['high', 'medium', 'low'].includes(it.confidence) ? it.confidence : 'low',
    })).filter((it) => it.kcal > 0 || it.p > 0 || it.c > 0 || it.f > 0);
    result.notes = typeof result.notes === 'string' ? result.notes : '';
    return result;
  }

  // Returns { ok: true, result: { kind, items, notes }, model } or { ok: false, error } with a message for the user.
  async function analyse(blob, note) {
    const mediaType = IMAGE_TYPES.includes(blob.type) ? blob.type : '';
    if (!mediaType) return { ok: false, error: 'This photo format can\'t be read. Take the photo in JPEG (most phones do) and try again.' };
    return getProvider() === 'gemini' ? analyseGemini(blob, mediaType, note) : analyseClaude(blob, mediaType, note);
  }

  async function analyseGemini(blob, mediaType, note) {
    const apiKey = getGeminiKey();
    if (!apiKey) return { ok: false, error: 'Add your Gemini API key in Body → Settings first.' };
    const model = getGeminiModel();
    let res;
    try {
      res = await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mediaType, data: await toBase64(blob) } }, { text: userText(note) }] }],
          generationConfig: { maxOutputTokens: 8192, responseMimeType: 'application/json', responseJsonSchema: SCHEMA },
        }),
      });
    } catch { return { ok: false, error: 'Couldn\'t reach Google. Check your connection.' }; }
    if (!res.ok) {
      let message = '';
      try { message = (await res.json())?.error?.message || ''; } catch { /* not JSON */ }
      if (res.status === 429) return { ok: false, error: 'Gemini\'s free limit is used up for now. Wait a minute (or until tomorrow) and try again.' };
      if (res.status === 404) return { ok: false, error: `Gemini model "${model}" wasn't found. Change the model name in Body → Settings.` };
      if (res.status === 400 && /api key/i.test(message)) return { ok: false, error: 'Google didn\'t accept the Gemini API key. Check it in Body → Settings.' };
      if (res.status === 403) return { ok: false, error: `Google refused the key: ${message || 'permission denied'}.` };
      return { ok: false, error: `Gemini returned an error (${res.status})${message ? `: ${message}` : ''}.` };
    }
    let data;
    try { data = await res.json(); } catch { return { ok: false, error: 'Gemini sent something unreadable. Try again.' }; }
    if (data?.promptFeedback?.blockReason) return { ok: false, error: 'Gemini declined to read this photo. Enter the food yourself instead.' };
    const cand = data?.candidates?.[0];
    const reason = cand?.finishReason;
    if (reason === 'MAX_TOKENS') return { ok: false, error: 'The answer was cut short. Try again, or crop the photo to the food.' };
    if (reason && reason !== 'STOP' && reason !== 'FINISH_REASON_UNSPECIFIED') return { ok: false, error: 'Gemini declined to read this photo. Enter the food yourself instead.' };
    const text = (cand?.content?.parts || []).filter((p) => !p.thought && p.text).map((p) => p.text).join('');
    let result;
    try { result = JSON.parse(text); } catch { return { ok: false, error: 'Gemini\'s answer couldn\'t be read. Try again.' }; }
    return { ok: true, result: tidy(result), model };
  }

  async function analyseClaude(blob, mediaType, note) {
    const apiKey = getKey();
    if (!apiKey) return { ok: false, error: 'Add your Anthropic API key in Body → Settings first.' };
    let mod;
    try { mod = await loadSdk(); } catch { return { ok: false, error: 'Couldn\'t load the Claude library. Photo logging needs an internet connection.' }; }
    const Anthropic = mod.default;
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    const model = getModel();
    const params = {
      model,
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: await toBase64(blob) } },
        { type: 'text', text: userText(note) },
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
    return { ok: true, result: tidy(result), model: res.model };
  }

  return { MODELS, DEFAULT_GEMINI_MODEL, getKey, setKey, getModel, setModel, getGeminiKey, setGeminiKey, getGeminiModel, setGeminiModel, getProvider, setProvider, providerName, ready, analyse };
})();
