// n8n Code node "To log row" (Run Once for Each Item)
// Flattens a successful parse into one telemetry_logs row. Column names match
// schema.sql, so the Postgres node maps them automatically. training and flags
// are sent as JSON text; Postgres casts them to jsonb.
const { data, model, usage, raw_log, ingested_at } = $input.item.json;
const b = data.biometrics ?? {};
const n = data.nutrition ?? {};

return {
  json: {
    ingested_at,
    logged_at: data.timestamp ?? null,
    body_weight_kg: b.body_weight_kg ?? null,
    step_count: b.step_count ?? null,
    resting_heart_rate: b.resting_heart_rate ?? null,
    sleep_hours: b.sleep_hours ?? null,
    protocol: n.protocol ?? null,
    total_calories: n.total_calories ?? null,
    protein_grams: n.protein_grams ?? null,
    adherence: n.adherence ?? null,
    training: JSON.stringify(data.training ?? []),
    flags: JSON.stringify(data.flags ?? []),
    raw_log,
    model: model ?? null,
    input_tokens: usage?.input_tokens ?? null,
    output_tokens: usage?.output_tokens ?? null,
  },
};
