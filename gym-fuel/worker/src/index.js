// Gym & Fuel free photo logging: a small Cloudflare Worker that reads a food photo with Google's Gemini (free tier),
// so people can use photo logging without an API key of their own.
//
// - The Gemini key is a Worker secret (GEMINI_API_KEY). It never reaches the app or the repo.
// - Only food photos: the request carries an image and a short note; the prompt and the JSON schema live here, so the
//   Worker can't be used as a general free AI.
// - Only from the app: requests must come from an allowed origin (ALLOWED_ORIGINS).
// - Daily caps, counted exactly in one Durable Object (SQLite, free plan): PER_IP_DAILY photos per connection and
//   DAILY_TOTAL for everyone, so the free tier isn't used up. IP addresses are stored only as a salted hash and
//   forgotten the next day.
// The prompt and schema must match gym-fuel/foodai.js (worker/test/worker.test.mjs checks it).

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_CHARS = 2_000_000; // base64; the app sends photos shrunk to 1080 px (~150-300 KB)
const MAX_NOTE = 400;

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

const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 10) / 10 : 0);
function tidy(result) {
  const items = (Array.isArray(result?.items) ? result.items : []).map((it) => ({
    name: String(it?.name || 'Food').slice(0, 80), grams: num(it?.grams), kcal: Math.round(num(it?.kcal)),
    protein_g: num(it?.protein_g), carbs_g: num(it?.carbs_g), fat_g: num(it?.fat_g),
    confidence: ['high', 'medium', 'low'].includes(it?.confidence) ? it.confidence : 'low',
  }));
  const kind = ['meal', 'drink', 'label', 'menu', 'not_food'].includes(result?.kind) ? result.kind : 'meal';
  return { kind, items, notes: typeof result?.notes === 'string' ? result.notes.slice(0, 400) : '' };
}

async function hashIp(ip, day, salt) {
  const data = new TextEncoder().encode(`${salt}|${day}|${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Exact daily counters. One instance ('usage') serialises every reservation, so two phones can't both take the last photo.
export class UsageCounter {
  constructor(state) { this.storage = state.storage; }
  async fetch(request) {
    const { op, day, who, perIp, total } = await request.json();
    if ((await this.storage.get('day')) !== day) { await this.storage.deleteAll(); await this.storage.put('day', day); }
    const mine = (await this.storage.get(`ip:${who}`)) || 0;
    const all = (await this.storage.get('all')) || 0;
    if (op === 'take') {
      if (all >= total) return Response.json({ ok: false, reason: 'total' });
      if (mine >= perIp) return Response.json({ ok: false, reason: 'ip' });
      await this.storage.put({ [`ip:${who}`]: mine + 1, all: all + 1 });
      return Response.json({ ok: true, left: perIp - mine - 1 });
    }
    if (op === 'refund') {
      await this.storage.put({ [`ip:${who}`]: Math.max(0, mine - 1), all: Math.max(0, all - 1) });
      return Response.json({ ok: true });
    }
    return Response.json({ ok: false }, { status: 400 });
  }
}

function counter(env) {
  const stub = env.USAGE.get(env.USAGE.idFromName('usage'));
  return (body) => stub.fetch('https://usage/', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const allowed = String(env.ALLOWED_ORIGINS || 'https://eddie144-ai.github.io').split(',').map((s) => s.trim()).filter(Boolean);
    const okOrigin = allowed.includes(origin);
    const cors = okOrigin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '86400' } : { Vary: 'Origin' };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors } });
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: okOrigin ? 204 : 403, headers: cors });
    if (request.method === 'GET' && url.pathname === '/') return reply(200, { ok: true, service: 'gym-fuel-food-ai', ready: !!env.GEMINI_API_KEY });
    if (request.method !== 'POST' || url.pathname !== '/analyse') return reply(404, { ok: false, error: 'Not found.' });
    if (!okOrigin) return reply(403, { ok: false, error: 'This service only answers the Gym & Fuel app.' });
    if (!env.GEMINI_API_KEY) return reply(503, { ok: false, error: 'Free photo logging isn\'t switched on yet.' });
    if (Number(request.headers.get('content-length') || 0) > MAX_IMAGE_CHARS + 10_000) return reply(413, { ok: false, error: 'That photo is too large.' });

    let body;
    try { body = await request.json(); } catch { return reply(400, { ok: false, error: 'Bad request.' }); }
    const { mimeType, image } = body || {};
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, MAX_NOTE) : '';
    if (!IMAGE_TYPES.includes(mimeType) || typeof image !== 'string' || !image || image.length > MAX_IMAGE_CHARS || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) {
      return reply(400, { ok: false, error: 'That photo can\'t be read. Try a JPEG photo.' });
    }

    const day = new Date().toISOString().slice(0, 10);
    const who = await hashIp(request.headers.get('CF-Connecting-IP') || 'unknown', day, env.IP_SALT || 'gym-fuel');
    const perIp = Math.max(1, Number(env.PER_IP_DAILY) || 10), total = Math.max(1, Number(env.DAILY_TOTAL) || 200);
    const take = counter(env);
    const slot = await take({ op: 'take', day, who, perIp, total });
    if (!slot.ok) {
      return reply(429, { ok: false, error: slot.reason === 'ip'
        ? `That's today's ${perIp} free photos used. Enter food yourself, add your own free Gemini key in Settings, or try again tomorrow.`
        : 'Free photo logging is used up for today across everyone. Try again tomorrow, or add your own free Gemini key in Settings.' });
    }
    const refund = () => ctx.waitUntil(take({ op: 'refund', day, who, perIp, total }).catch(() => {}));

    const model = env.GEMINI_MODEL || 'gemini-3.8-flash';
    let res;
    try {
      res = await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data: image } }, { text: note ? `What I ate, in my words: ${note}` : 'Log what is in this photo.' }] }],
          generationConfig: { maxOutputTokens: 8192, responseMimeType: 'application/json', responseJsonSchema: SCHEMA },
        }),
      });
    } catch { refund(); return reply(502, { ok: false, error: 'Couldn\'t reach Google. Try again.' }); }
    if (!res.ok) {
      refund();
      if (res.status === 429) return reply(503, { ok: false, error: 'The free AI is busy right now. Try again in a minute.' });
      return reply(502, { ok: false, error: `The AI service returned an error (${res.status}). Try again later.` });
    }
    let data;
    try { data = await res.json(); } catch { refund(); return reply(502, { ok: false, error: 'The AI sent something unreadable. Try again.' }); }
    const cand = data?.candidates?.[0];
    const reason = cand?.finishReason;
    if (data?.promptFeedback?.blockReason || (reason && !['STOP', 'FINISH_REASON_UNSPECIFIED', 'MAX_TOKENS'].includes(reason))) {
      return reply(422, { ok: false, error: 'The AI declined to read this photo. Enter the food yourself instead.' });
    }
    if (reason === 'MAX_TOKENS') { refund(); return reply(502, { ok: false, error: 'The answer was cut short. Try again, or crop the photo to the food.' }); }
    const text = (cand?.content?.parts || []).filter((p) => !p.thought && p.text).map((p) => p.text).join('');
    let result;
    try { result = JSON.parse(text); } catch { refund(); return reply(502, { ok: false, error: 'The AI\'s answer couldn\'t be read. Try again.' }); }
    return reply(200, { ok: true, result: tidy(result), left: slot.left, model });
  },
};
