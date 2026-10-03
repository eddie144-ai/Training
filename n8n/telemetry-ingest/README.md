# Telemetry ingest (n8n + Claude)

Turns a raw daily log (notes, Garmin numbers, voice-note transcript, workout notes) into one JSON
object with a fixed shape, and saves it to Postgres.

Flow: **Webhook** (POST `{"raw_log": "..."}`) → **Build Claude request** → **Claude Messages API**
→ **Parse Claude response** → **Parsed OK?**
- yes → **To log row** → **Insert telemetry log** (table `telemetry_logs`)
- no → **To error row** → **Insert ingest error** (table `telemetry_ingest_errors`, with the raw
  log so it can be re-sent)

## Files
- `system-prompt.txt`: the parser's instructions, word for word as originally written.
- `schema.json`: the output shape, exactly as originally written. It goes to the API as a
  structured-output schema (minus the `$schema` line), so Claude's reply always matches it.
- `build-request.js`, `parse-response.js`, `to-log-row.js`, `to-error-row.js`: the Code nodes.
- `schema.sql`: creates the two Postgres tables.
- `build.mjs`: writes `workflow.json` from the files above. Run `node build.mjs` after any edit.
- `workflow.json`: import this into n8n (Workflows → Import from file).

## Setup
1. Create the tables: `psql "$DATABASE_URL" -f schema.sql` (safe to run again).
2. Import `workflow.json`.
3. Create a **Header Auth** credential named `Anthropic API key`: name `x-api-key`, value your key.
   Select it on the **Claude Messages API** node. A credential is used instead of `$env` because
   n8n blocks `$env` in expressions by default (`N8N_BLOCK_ENV_ACCESS_IN_NODE`).
4. Create a **Postgres** credential named `Postgres` for your database and select it on both
   insert nodes. If n8n asks, open each insert node once so it loads the table's columns.
5. Activate it, then test:
   ```bash
   curl -X POST http://localhost:5678/webhook/telemetry-ingest \
     -H 'Content-Type: application/json' \
     -d '{"raw_log": "96.2 kg this morning, 9,100 steps, 6.5h sleep, RHR 58. 18:6 kept, 1,850 kcal, 160 g protein. Bench 1x7 @ 82.5 kg to failure, felt flat."}'
   ```

## What changed from the original spec
The user message wording is unchanged. The system prompt is unchanged apart from one added
sentence in rule 2 that converts lbs to kg. The schema is unchanged apart from
`sets` and `reps`, which can be null. Only what breaks the API call
or the parsing was fixed.
| Original | Change | Why |
|---|---|---|
| `claude-3-5-sonnet-20241022` | `claude-opus-5-5` | That model was retired on 28 Oct 2025, so every call would fail. |
| `temperature: 0.0` | Removed. `output_config.effort: "low"` instead | Current models reject sampling parameters with a 400. Low effort suits extraction. |
| Schema only used downstream | Sent as `output_config.format` (`json_schema`) | Claude never saw the schema before. Now the API forces output that matches it, so no markdown stripping or retry is needed. |
| `max_tokens: 1024` | `16000` | Thinking is always on with this model and counts toward the limit, so 1024 could cut the JSON off. |
| `content[0].text` | Uses the first `text` block | `content[0]` can be a thinking or fallback block. |
| Log pasted into a hand-written JSON body | Body built in code, sent with `JSON.stringify` | A log with a quote or line break made the old body invalid JSON. |
| No `stop_reason` check | `refusal` and `max_tokens` return `success: false` | Either one means the output isn't usable. |
| `$schema` line | Kept in `schema.json`, left out of the API request | It's validator metadata, not part of the output shape. |
| No fallback | `fallbacks: "default"` + `anthropic-beta: server-side-fallback-2026-07-01` | If a safety classifier declines, the API retries on a fallback model in the same call. |

## Tables
`telemetry_logs` has one row per parsed log: the biometric and nutrition fields as columns,
`training` and `flags` as `jsonb`, plus `raw_log`, `model` and token counts. `logged_at` is the time
stated in the log and is usually null, so sort and filter by `ingested_at`.

Example: reps per exercise over time.
```sql
SELECT ingested_at::date, t->>'exercise' AS exercise, (t->>'weight_kg')::numeric AS kg,
       (t->>'sets')::int AS sets, (t->>'reps')::int AS reps
FROM telemetry_logs, jsonb_array_elements(training) AS t
ORDER BY 1, 2;
```

`telemetry_ingest_errors` keeps logs Claude couldn't parse (refusal, cut-off reply, API error,
bad JSON) with the error and the raw log.
