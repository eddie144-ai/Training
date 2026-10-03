-- Tables for the telemetry ingest workflow. Run once before activating it:
--   psql "$DATABASE_URL" -f schema.sql

-- One row per successfully parsed log.
CREATE TABLE IF NOT EXISTS telemetry_logs (
  id                 bigserial PRIMARY KEY,
  ingested_at        timestamptz NOT NULL,
  logged_at          timestamptz,           -- timestamp stated in the log, if any
  body_weight_kg     numeric,
  step_count         integer,
  resting_heart_rate integer,
  sleep_hours        numeric,
  protocol           text,
  total_calories     integer,
  protein_grams      integer,
  adherence          boolean,
  training           jsonb NOT NULL,        -- [{exercise, weight_kg, sets, reps, notes}]
  flags              jsonb NOT NULL,        -- ["..."]
  raw_log            text NOT NULL,
  model              text,
  input_tokens       integer,
  output_tokens      integer
);

CREATE INDEX IF NOT EXISTS telemetry_logs_ingested_at_idx ON telemetry_logs (ingested_at);

-- Logs Claude couldn't parse (refusal, cut-off reply, API error, bad JSON),
-- kept with the raw log so they can be re-sent.
CREATE TABLE IF NOT EXISTS telemetry_ingest_errors (
  id          bigserial PRIMARY KEY,
  ingested_at timestamptz NOT NULL,
  error       text NOT NULL,
  stop_reason text,
  model       text,
  raw_output  text,
  raw_log     text NOT NULL
);
