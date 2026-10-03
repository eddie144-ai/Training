// n8n Code node "Parse Claude response" (Run Once for Each Item)
// Input: the HTTP Request node's output (the raw Messages API response).
// The response can hold thinking and fallback blocks before the text, so
// find the text block instead of reading content[0].
const res = $input.item.json;
const ingestedAt = new Date().toISOString();

function fail(error, extra = {}) {
  return {
    json: {
      success: false,
      error,
      stop_reason: res.stop_reason ?? null,
      model: res.model ?? null,
      ...extra,
      ingested_at: ingestedAt,
    },
  };
}

if (res.type === 'error' || res.error) {
  return fail(`API error: ${res.error?.type ?? 'unknown'}: ${res.error?.message ?? ''}`);
}
if (res.stop_reason === 'refusal') {
  return fail('Claude declined the request', { stop_details: res.stop_details ?? null });
}
if (res.stop_reason === 'max_tokens') {
  return fail('Output hit max_tokens and is incomplete');
}

const text = (res.content ?? [])
  .filter((block) => block.type === 'text')
  .map((block) => block.text)
  .join('')
  .trim();

try {
  const data = JSON.parse(text);
  return {
    json: {
      success: true,
      data,
      model: res.model,
      usage: res.usage ?? null,
      ingested_at: ingestedAt,
    },
  };
} catch (error) {
  return fail('JSON parsing failed', { raw_output: text });
}
