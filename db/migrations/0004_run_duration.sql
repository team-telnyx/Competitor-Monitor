-- 0004_run_duration.sql — record how long each pipeline run took.
--
-- runs.started_at/finished_at previously both stored the crawl timestamp, so duration
-- couldn't be derived. The pipeline now emits its wall-clock; we persist it here so the
-- Training "pipeline run time" graph can plot it over time. Nullable; null = unknown
-- (runs ingested before this column).
--
-- Apply:  psql "$DATABASE_URL" -f db/migrations/0004_run_duration.sql

BEGIN;

ALTER TABLE runs ADD COLUMN IF NOT EXISTS duration_ms integer;

INSERT INTO schema_migrations (version) VALUES ('0004_run_duration') ON CONFLICT DO NOTHING;

COMMIT;
