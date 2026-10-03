import type { CouncilInput, CouncilMatrix, SeatId, SeatOutput } from '../types';
import { claudeEngine } from './anthropic';
import { getApiKey, getGeminiModel, getProvider } from './apiKey';
import type { Engine } from './engine';
import { geminiEngine } from './gemini';
import { MATRIX_SCHEMA, SYNTHESIZER_PROMPT, SYSTEM_PROMPTS, buildSeatMessage } from './prompts';
import { SEATS, SEAT_ORDER } from './seats';

/** The engine for the provider chosen in Settings. Throws if its key is missing. */
export async function getEngine(): Promise<Engine> {
  const provider = await getProvider();
  const key = await getApiKey(provider);
  if (!key) {
    throw new Error(`No ${provider === 'gemini' ? 'Gemini' : 'Anthropic'} API key. Add it in Settings.`);
  }
  return provider === 'gemini' ? geminiEngine(key, await getGeminiModel()) : claudeEngine(key);
}

export interface CouncilCallbacks {
  /** A seat started or received more streamed text. `analysis` is the full text so far. */
  onSeatUpdate?: (output: SeatOutput) => void;
  /** All seats finished (some may have failed); synthesis is starting. */
  onSynthesisStart?: () => void;
  signal?: AbortSignal;
}

async function runSeat(
  engine: Engine,
  seatId: SeatId,
  input: CouncilInput,
  { onSeatUpdate, signal }: CouncilCallbacks,
): Promise<SeatOutput> {
  const seatName = SEATS[seatId].name;
  let text = '';
  onSeatUpdate?.({ seatId, seatName, analysis: '', status: 'streaming' });

  try {
    const analysis = await engine.streamText({
      system: SYSTEM_PROMPTS[seatId],
      user: buildSeatMessage(input),
      signal,
      onText: (delta) => {
        text += delta;
        onSeatUpdate?.({ seatId, seatName, analysis: text, status: 'streaming' });
      },
    });
    const result: SeatOutput = { seatId, seatName, analysis, status: 'complete' };
    onSeatUpdate?.(result);
    return result;
  } catch (err) {
    if (signal?.aborted) throw err;
    const error = err instanceof Error ? err.message : String(err);
    const result: SeatOutput = { seatId, seatName, analysis: text, status: 'error', error };
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

/**
 * Runs the four seats in parallel, streaming each into `onSeatUpdate`, then synthesizes the
 * matrix. A failed seat doesn't sink the run; synthesis needs at least two seats.
 */
export async function runCouncilDeliberation(
  engine: Engine,
  input: CouncilInput,
  callbacks: CouncilCallbacks = {},
): Promise<{ seatOutputs: SeatOutput[]; matrix: CouncilMatrix }> {
  const seatOutputs = await Promise.all(SEAT_ORDER.map((id) => runSeat(engine, id, input, callbacks)));
  const answered = seatOutputs.filter((s) => s.status === 'complete' && s.analysis);
  if (answered.length < 2) {
    const reasons = seatOutputs.filter((s) => s.error).map((s) => s.error);
    throw new Error(`Too few seats answered to synthesize. ${reasons[0] ?? ''}`.trim());
  }

  callbacks.onSynthesisStart?.();
  const analyses = answered.map((s) => `[${s.seatName.toUpperCase()}]\n${s.analysis}`).join('\n\n');
  const matrix = await engine.generateJson({
    system: SYNTHESIZER_PROMPT,
    user: `Original proposition:\n${input.query}\n\nCouncil seat analyses:\n\n${analyses}`,
    schema: MATRIX_SCHEMA,
    signal: callbacks.signal,
  });
  if (!isMatrix(matrix)) throw new Error('The synthesis came back in an unexpected shape.');
  return { seatOutputs, matrix };
}
