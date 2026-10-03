import Anthropic from '@anthropic-ai/sdk';
import type { BetaContentBlock, BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';

import type { CouncilInput, CouncilMatrix, SeatId, SeatOutput } from '../types';
import { getApiKey } from './apiKey';
import { MATRIX_SCHEMA, SYNTHESIZER_PROMPT, SYSTEM_PROMPTS, buildSeatMessage } from './prompts';
import { SEATS, SEAT_ORDER } from './seats';

const MODEL = 'claude-opus-5-5';
// Server-side fallback: if a safety classifier declines, the API re-runs the request on the
// recommended fallback model inside the same call instead of returning a refusal.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

const clients = new Map<string, Anthropic>();
async function getClient(): Promise<Anthropic> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('No API key. Add your Anthropic API key in Settings.');
  let client = clients.get(apiKey);
  if (!client) {
    client = new Anthropic({
      apiKey,
      // Calls go straight from the device to the API with the user's own key, which never
      // leaves their device otherwise. Put a proxy in front before sharing a build that embeds one.
      dangerouslyAllowBrowser: true,
      // React Native's built-in fetch can't stream response bodies; expo/fetch can.
      ...(Platform.OS !== 'web' && { fetch: expoFetch as unknown as typeof fetch }),
    });
    clients.set(apiKey, client);
  }
  return client;
}

/** Text of the final answer. If a fallback model took over, only its text counts. */
function finalText(content: BetaContentBlock[]): string {
  const lastFallback = content.map((b) => b.type).lastIndexOf('fallback');
  return content
    .slice(lastFallback + 1)
    .filter((b): b is Extract<BetaContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

function assertAnswered(message: BetaMessage): void {
  if (message.stop_reason === 'refusal') {
    throw new Error(message.stop_details?.explanation || 'The model declined this request.');
  }
}

function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'Invalid API key.';
  if (err instanceof Anthropic.RateLimitError) return 'Rate limited. Wait a moment and retry.';
  if (err instanceof Anthropic.APIConnectionError) return 'Network error. Check your connection.';
  if (err instanceof Anthropic.APIError) return `API error ${err.status ?? ''}: ${err.message}`.trim();
  return err instanceof Error ? err.message : String(err);
}

export interface CouncilCallbacks {
  /** A seat started or received more streamed text. `text` is the full text so far. */
  onSeatUpdate?: (output: SeatOutput) => void;
  /** All seats finished (some may have failed); synthesis is starting. */
  onSynthesisStart?: () => void;
  signal?: AbortSignal;
}

async function runSeat(
  client: Anthropic,
  seatId: SeatId,
  input: CouncilInput,
  { onSeatUpdate, signal }: CouncilCallbacks,
): Promise<SeatOutput> {
  const seatName = SEATS[seatId].name;
  let text = '';
  onSeatUpdate?.({ seatId, seatName, analysis: '', status: 'streaming' });

  try {
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 8000,
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        system: SYSTEM_PROMPTS[seatId],
        messages: [{ role: 'user', content: buildSeatMessage(input) }],
      },
      { signal },
    );
    stream.on('text', (delta) => {
      text += delta;
      onSeatUpdate?.({ seatId, seatName, analysis: text, status: 'streaming' });
    });
    const message = await stream.finalMessage();
    assertAnswered(message);

    const result: SeatOutput = { seatId, seatName, analysis: finalText(message.content), status: 'complete' };
    onSeatUpdate?.(result);
    return result;
  } catch (err) {
    if (signal?.aborted) throw err;
    const result: SeatOutput = { seatId, seatName, analysis: text, status: 'error', error: describeError(err) };
    onSeatUpdate?.(result);
    return result;
  }
}

function isMatrix(value: unknown): value is CouncilMatrix {
  const v = value as CouncilMatrix;
  const strings = (a: unknown) => Array.isArray(a) && a.every((s) => typeof s === 'string');
  return (
    !!v &&
    typeof v.verdict === 'string' &&
    strings(v.blindspots) &&
    strings(v.frictionPoints) &&
    strings(v.actionStrategy)
  );
}

async function synthesize(
  client: Anthropic,
  input: CouncilInput,
  seats: SeatOutput[],
  signal?: AbortSignal,
): Promise<CouncilMatrix> {
  const analyses = seats.map((s) => `[${s.seatName.toUpperCase()}]\n${s.analysis}`).join('\n\n');

  const message = await client.beta.messages.create(
    {
      model: MODEL,
      max_tokens: 8000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: MATRIX_SCHEMA as unknown as Record<string, unknown> },
      },
      system: SYNTHESIZER_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Original proposition:\n${input.query}\n\nCouncil seat analyses:\n\n${analyses}`,
        },
      ],
    },
    { signal },
  );
  assertAnswered(message);
  if (message.stop_reason === 'max_tokens') throw new Error('The synthesis was cut off. Retry.');

  const parsed: unknown = JSON.parse(finalText(message.content));
  if (!isMatrix(parsed)) throw new Error('The synthesis came back in an unexpected shape.');
  return parsed;
}

/**
 * Runs the four seats in parallel, streaming each into `onSeatUpdate`, then synthesizes the
 * matrix. A failed seat doesn't sink the run; synthesis needs at least two seats.
 */
export async function runCouncilDeliberation(
  input: CouncilInput,
  callbacks: CouncilCallbacks = {},
): Promise<{ seatOutputs: SeatOutput[]; matrix: CouncilMatrix }> {
  const client = await getClient(); // Fails fast on a missing key, before any seat starts.

  const seatOutputs = await Promise.all(SEAT_ORDER.map((id) => runSeat(client, id, input, callbacks)));
  const answered = seatOutputs.filter((s) => s.status === 'complete' && s.analysis);
  if (answered.length < 2) {
    const reasons = seatOutputs.filter((s) => s.error).map((s) => s.error);
    throw new Error(`Too few seats answered to synthesize. ${reasons[0] ?? ''}`.trim());
  }

  callbacks.onSynthesisStart?.();
  try {
    const matrix = await synthesize(client, input, answered, callbacks.signal);
    return { seatOutputs, matrix };
  } catch (err) {
    if (callbacks.signal?.aborted) throw err;
    throw new Error(describeError(err));
  }
}
