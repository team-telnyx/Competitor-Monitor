-- 0003_scrape_error.sql — record why a page failed to scrape.
--
-- The pipeline knows when a page returned no usable content (403, JS-rendered, timeout,
-- etc.) but we weren't persisting it. This column surfaces those failures in the Sources
-- detail view (and is the hook for the planned fallback scraper). Nullable; null = no error.
--
-- Apply:  psql "$DATABASE_URL" -f db/migrations/0003_scrape_error.sql

BEGIN;

ALTER TABLE pages ADD COLUMN IF NOT EXISTS scrape_error text;

INSERT INTO schema_migrations (version) VALUES ('0003_scrape_error') ON CONFLICT DO NOTHING;

COMMIT;
