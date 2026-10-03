import Anthropic from '@anthropic-ai/sdk';
import type { BetaContentBlock, BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';

import type { Engine } from './engine';

const MODEL = 'claude-opus-5-5';
// Server-side fallback: if a safety classifier declines, the API re-runs the request on the
// recommended fallback model inside the same call instead of returning a refusal.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

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
  if (message.stop_reason === 'max_tokens') throw new Error('The answer was cut off. Retry.');
}

function describeError(err: unknown): Error {
  if (err instanceof Anthropic.AuthenticationError) return new Error('Invalid Anthropic API key.');
  if (err instanceof Anthropic.RateLimitError) return new Error('Rate limited. Wait a moment and retry.');
  if (err instanceof Anthropic.APIConnectionError) return new Error('Network error. Check your connection.');
  if (err instanceof Anthropic.APIError) return new Error(`API error ${err.status ?? ''}: ${err.message}`.trim());
  return err instanceof Error ? err : new Error(String(err));
}

export function claudeEngine(apiKey: string): Engine {
  const client = new Anthropic({
    apiKey,
    // Calls go straight from the device to the API with the user's own key.
    dangerouslyAllowBrowser: true,
    // React Native's built-in fetch can't stream response bodies; expo/fetch can.
    ...(Platform.OS !== 'web' && { fetch: expoFetch as unknown as typeof fetch }),
  });

  return {
    label: 'Claude Opus 5.5',

    async streamText({ system, user, onText, signal }) {
      try {
        const stream = client.beta.messages.stream(
          {
            model: MODEL,
            max_tokens: 8000,
            betas: [FALLBACK_BETA],
            fallbacks: 'default',
            thinking: { type: 'adaptive' },
            output_config: { effort: 'medium' },
            system,
            messages: [{ role: 'user', content: user }],
          },
          { signal },
        );
        stream.on('text', onText);
        const message = await stream.finalMessage();
        assertAnswered(message);
        return finalText(message.content);
      } catch (err) {
        if (signal?.aborted) throw err;
        throw describeError(err);
      }
    },

    async generateJson({ system, user, schema, signal }) {
      try {
        const message = await client.beta.messages.create(
          {
            model: MODEL,
            max_tokens: 8000,
            betas: [FALLBACK_BETA],
            fallbacks: 'default',
            thinking: { type: 'adaptive' },
            output_config: {
              effort: 'medium',
              format: { type: 'json_schema', schema: schema as Record<string, unknown> },
            },
            system,
            messages: [{ role: 'user', content: user }],
          },
          { signal },
        );
        assertAnswered(message);
        return JSON.parse(finalText(message.content));
      } catch (err) {
        if (signal?.aborted) throw err;
        throw describeError(err);
      }
    },
  };
}
