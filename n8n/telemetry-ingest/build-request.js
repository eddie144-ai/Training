// n8n Code node "Build Claude request" (Run Once for Each Item)
// Input: the Webhook item, with the log at body.raw_log.
// Output: { request } for the HTTP Request node to send as its JSON body.
// build.mjs fills in SYSTEM_PROMPT and SCHEMA from system-prompt.txt and schema.json
// when it writes workflow.json. Edit those files, not the copy in workflow.json.
const SYSTEM_PROMPT = __SYSTEM_PROMPT__;
const SCHEMA = __SCHEMA__;

const rawLog = String($input.item.json.body?.raw_log ?? '').trim();
if (!rawLog) {
  throw new Error('body.raw_log is empty');
}

return {
  json: {
    raw_log: rawLog,
    request: {
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: SCHEMA },
      },
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Extract the telemetry from this log:\n\n<log>\n${rawLog}\n</log>`,
        },
      ],
    },
  },
};
