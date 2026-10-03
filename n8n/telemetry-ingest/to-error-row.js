// n8n Code node "To error row" (Run Once for Each Item)
// Shapes a failed parse into one telemetry_ingest_errors row (see schema.sql).
const { error, stop_reason, model, raw_output, raw_log, ingested_at } = $input.item.json;

return {
  json: {
    ingested_at,
    error,
    stop_reason: stop_reason ?? null,
    model: model ?? null,
    raw_output: raw_output ?? null,
    raw_log,
  },
};
