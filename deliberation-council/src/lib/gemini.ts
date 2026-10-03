import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';

import type { Engine } from './engine';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// React Native's built-in fetch can't stream response bodies; expo/fetch can.
const doFetch: typeof fetch = Platform.OS === 'web' ? fetch : (expoFetch as unknown as typeof fetch);

interface Part {
  text?: string;
  thought?: boolean;
}
interface GenerateResponse {
  candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

/** "gemini-3.8-flash" -> "Gemini 3.8 Flash". */
export function geminiLabel(model: string): string {
  return model
    .split('-')
    .map((w) => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

async function apiError(res: Response, model: string): Promise<Error> {
  let message = '';
  try {
    message = ((await res.json()) as { error?: { message?: string } }).error?.message ?? '';
  } catch {
    // Non-JSON error body.
  }
  if (res.status === 429) return new Error('Gemini rate limit reached (free tier). Wait a minute and retry.');
  if (res.status === 404) return new Error(`Gemini model "${model}" not found. Check the model name in Settings.`);
  if (res.status === 400 && /api key/i.test(message)) return new Error('Invalid Gemini API key.');
  if (res.status === 403) return new Error(`Gemini refused the key: ${message || 'permission denied'}.`);
  return new Error(`Gemini error ${res.status}${message ? `: ${message}` : ''}`);
}

/** Answer text from one response or stream chunk, skipping thought summaries. Throws on a block. */
function chunkText(data: GenerateResponse): string {
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked this request (${data.promptFeedback.blockReason}).`);
  }
  const candidate = data.candidates?.[0];
  const reason = candidate?.finishReason;
  if (reason && reason !== 'STOP' && reason !== 'FINISH_REASON_UNSPECIFIED') {
    throw new Error(reason === 'MAX_TOKENS' ? 'The answer was cut off. Retry.' : `Gemini stopped early (${reason}).`);
  }
  return (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought && p.text)
    .map((p) => p.text)
    .join('');
}

function request(system: string, user: string, generationConfig: object) {
  return JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { maxOutputTokens: 8192, ...generationConfig },
  });
}

/** fetch, with a network failure turned into a readable error. */
async function post(input: string, init: RequestInit): Promise<Response> {
  try {
    return await doFetch(input, init);
  } catch (err) {
    if (init.signal?.aborted) throw err;
    throw new Error('Network error. Check your connection.');
  }
}

export function geminiEngine(apiKey: string, model: string): Engine {
  const headers = { 'content-type': 'application/json', 'x-goog-api-key': apiKey };
  const url = (method: string) => `${BASE}/${encodeURIComponent(model)}:${method}`;

  return {
    label: geminiLabel(model),

    async streamText({ system, user, onText, signal }) {
      const res = await post(`${url('streamGenerateContent')}?alt=sse`, {
        method: 'POST',
        headers,
        body: request(system, user, {}),
        signal,
      });
      if (!res.ok) throw await apiError(res, model);

      let full = '';
      const handleEvent = (event: string) => {
        const data = event
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim())
          .join('');
        if (!data) return;
        const delta = chunkText(JSON.parse(data) as GenerateResponse);
        if (delta) {
          full += delta;
          onText(delta);
        }
      };

      const reader = res.body?.getReader();
      if (!reader) {
        // No streaming body available: parse the whole SSE payload at once.
        (await res.text()).replace(/\r\n/g, '\n').split('\n\n').forEach(handleEvent);
        return full.trim();
      }
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let cut: number;
        while ((cut = buffer.indexOf('\n\n')) !== -1) {
          handleEvent(buffer.slice(0, cut));
          buffer = buffer.slice(cut + 2);
        }
      }
      handleEvent(buffer);
      return full.trim();
    },

    async generateJson({ system, user, schema, signal }) {
      const res = await post(url('generateContent'), {
        method: 'POST',
        headers,
        body: request(system, user, { responseMimeType: 'application/json', responseJsonSchema: schema }),
        signal,
      });
      if (!res.ok) throw await apiError(res, model);
      return JSON.parse(chunkText((await res.json()) as GenerateResponse));
    },
  };
}
