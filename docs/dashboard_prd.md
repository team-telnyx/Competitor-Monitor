# PRD: Competitor Intelligence Dashboard

**Status:** Draft
**Author:** Jake Johnson (jakej@telnyx.com)
**Created:** 2026-06-10
**Related:** [Competitor Monitor tool](../tools/competitor_monitor.py) · [Monitoring workflow](../workflows/competitor_monitoring.md) · Slack digest delivery (the "slackbot")

---

## 1. Summary

The Competitor Monitor today runs as a daily Python job that scrapes competitor sitemaps, classifies new pages with Claude (AI Assistants / Inference / STT / TTS), generates an executive digest, and **pushes** it to Slack and email. There is no way to **pull** — every signal older than today's message is buried in timestamped JSON files under `.tmp/`.

This PRD specifies a web dashboard, built alongside the Slack delivery path, that gives the data a persistent home. It serves three jobs in one product:

1. **Browsable intel archive** — every detected update, searchable and filterable across all history.
2. **Monitoring ops console** — pipeline health, failed sitemaps, snapshot baselines, manual run triggers, competitor management.
3. **Competitive analysis hub** — trends, activity heatmaps, and focus-area momentum over time.

The Slack digest remains the daily *push*; the dashboard is the durable *pull* surface behind it. Every Slack message should deep-link into the dashboard.

## 2. Background & problem

The current pipeline ([`run_monitor`](../tools/competitor_monitor.py)) produces rich structured output per run:

- Per competitor: `total_sitemap_urls`, list of `new_pages`, `checked_at`
- Per page: `url`, `lastmod`, detection `source` (`snapshot_diff` vs lastmod), scraped `{title, description, text_preview, text_length}`, and `classification {relevant, category, summary}`
- Per run: the LLM `digest`, `scan_time`, look-back `hours`

All of this is written to `.tmp/competitor_monitor_<timestamp>.json` and Slack, then effectively lost. Concrete gaps this creates:

- **No history.** "What did ElevenLabs ship last quarter?" requires grepping JSON files.
- **No search.** Can't find every TTS update across all competitors.
- **No observability.** When a sitemap 404s or a snapshot baseline resets, it's a `stderr` line nobody sees. Snapshot-diff competitors silently return 0 on first run by design.
- **No trends.** Can't see that a competitor's shipping cadence spiked, or which focus area is heating up.
- **No control surface.** Adding a competitor means editing the `COMPETITORS` list in Python and redeploying.

## 3. Goals & non-goals

### Goals
- Persist all monitor runs and detected pages in a queryable datastore (replacing `.tmp` JSON as the source of truth).
- Browsable, searchable, filterable archive of every classified update.
- Ops console: run history, per-competitor health, error surfacing, manual trigger, competitor CRUD.
- Analytics: activity over time, per-competitor and per-focus-area trends, heatmaps.
- Deep-linkable: Slack digest entries link to the corresponding dashboard view.
- Serve both audiences — leadership-facing intel views and an admin/ops area, gated separately.

### Non-goals (v1)
- Replacing the scraping/classification pipeline — the dashboard reads what the existing tool produces; pipeline logic is unchanged except for writing to the DB.
- Real-time streaming — daily (or on-demand) cadence is sufficient.
- Multi-tenant / external customers — internal Telnyx tool only.
- Editing or annotating Claude's classifications by hand (candidate for v2).
- Linear ticket creation (separate roadmap item; dashboard should leave a hook for it).

## 4. Audiences & personas

| Persona | Role | Primary surface | Needs |
|---|---|---|---|
| **Product leadership** (Max, Jake, strategy) | Consume intelligence | Archive feed + Analytics | Skimmable, insightful, trustworthy, fast to "what changed and why it matters" |
| **Pipeline operator** (whoever runs/maintains it) | Operate & debug | Ops console | Run status, error visibility, manual control, competitor config |

Both audiences hit the same app; the **ops/admin area is gated** (role-based) so leadership sees a clean intel product and operators get the control panel.

## 5. Scope & key flows

### 5.1 Intel archive (browse & search)
- Reverse-chronological feed of relevant updates across all competitors.
- Filters: competitor, focus area (AI Assistants / Inference / STT / TTS / Other), date range, detection source, relevance.
- Full-text search across title, description, summary, and scraped preview.
- Each item card shows: competitor, category badge (reuse existing color map — AI Assistants `#8e44ad`, Inference `#e67e22`, STT `#27ae60`, TTS `#2980b9`, Other `#7f8c8d`), title (links to source URL), Claude's one-line summary, detected date.
- Item detail view: full scraped preview, classification, which run detected it, raw metadata.
- Saved/archived digests: read any past run's executive digest as it was sent.

### 5.2 Ops console
- **Run history:** every monitor run with timestamp, duration, look-back window, competitors checked, new/relevant counts, status (success / partial / failed).
- **Per-competitor health:** last successful check, last new page found, sitemap fetch status, detection method, snapshot baseline state and size, error count. Flag competitors that have returned 0 for an unusually long stretch (possible silent breakage).
- **Error surfacing:** capture the warnings currently sent to `stderr` (sitemap fetch failures, parse errors, classification failures, Slack/email delivery errors) and display them per run.
- **Manual trigger:** kick off a run from the UI (optionally scoped to one competitor, with a custom look-back window), mirroring the existing CLI flags (`--hours`, `--no-slack`, etc.).
- **Competitor management:** CRUD over the competitor config that currently lives in the `COMPETITORS` list — name, sitemap URLs, include/exclude regex patterns, `use_snapshot_diff` toggle. Validate regex on save.

### 5.3 Analytics hub
- Activity over time: updates per day/week, total and per focus area.
- Per-competitor cadence: shipping frequency, recent spikes.
- Focus-area momentum: which categories are heating up across the field.
- Competitor × focus-area heatmap (who's investing where).
- Leaderboards: most active competitors in a window.

### 5.4 Slack ↔ dashboard integration
- Slack digest blocks gain "View in dashboard" deep links (to the run, and per-item to the detail view).
- Dashboard surfaces delivery status of each digest (sent / failed, channel, recipients).
- Preserve the existing Slack behavior (post to `SLACK_COMPETITOR_CHANNEL`, default `#product-intel`); the dashboard does not replace it.

## 6. Data model

Migrate from `.tmp` JSON to a relational store (Postgres recommended). The existing JSON maps cleanly:

- **`competitors`** — `id, name, sitemap_urls (jsonb), include_patterns (jsonb), exclude_patterns (jsonb), use_snapshot_diff, active, created_at, updated_at`
- **`runs`** — `id, started_at, finished_at, hours_window, status, trigger (scheduled|manual), digest_text, slack_status, email_status, error_summary`
- **`run_competitors`** — `id, run_id, competitor_id, total_sitemap_urls, new_page_count, relevant_count, checked_at, status, error` (per-competitor result within a run)
- **`pages`** — `id, run_competitor_id, competitor_id, url, lastmod, detection_source, title, description, text_preview, text_length, first_seen_run_id, scraped_at`
- **`classifications`** — `id, page_id, relevant, category, summary, model, classified_at` (1:1 with page in v1; separate table leaves room for re-classification history)
- **`snapshots`** — `id, competitor_id, urls (jsonb), url_count, saved_at` (replaces `.tmp/snapshots/*.json`)

Notes:
- Dedupe pages by `(competitor_id, url)` so the same URL re-detected doesn't create archive noise; track `first_seen_run_id`.
- Keep writing a JSON artifact per run optionally for backwards-compat, but the DB is the source of truth.

## 7. Architecture

Per the decision to build a **decoupled React frontend + JSON API**:

- **Backend API:** FastAPI (Python) — keeps the dashboard in the same language as the pipeline, so it can import and reuse the existing tool code directly (config, scraping, classification, snapshot logic). Exposes REST/JSON endpoints for the frontend and houses the run trigger.
- **Pipeline integration:** refactor [`run_monitor`](../tools/competitor_monitor.py) to persist to the DB (via the API's data layer or a shared module) instead of only writing `.tmp` JSON. The CLI continues to work; it just also writes to the DB.
- **Frontend:** React (Vite + TypeScript), a component library (e.g. shadcn/ui or MUI), a charting lib (Recharts) for analytics, React Query for data fetching.
- **Scheduler:** existing cron/scheduled run stays; manual triggers go through the API (async job + status polling so the UI doesn't block on a multi-minute scrape).
- **Auth:** SSO/Google or a simple gateway; role gate for the ops/admin area.

### Representative API surface
```
GET  /api/pages?competitor=&category=&from=&to=&q=&page=     # archive feed + search
GET  /api/pages/{id}                                         # item detail
GET  /api/runs                                               # run history
GET  /api/runs/{id}                                          # run detail + digest + errors
POST /api/runs                                               # trigger a manual run (async)
GET  /api/competitors                                        # list/health
POST /api/competitors  /  PUT /api/competitors/{id}          # CRUD config
GET  /api/analytics/activity?from=&to=&groupBy=              # time series
GET  /api/analytics/heatmap                                  # competitor × focus area
```

## 8. Success metrics
- Time-to-answer for "what did competitor X ship in period Y" drops from minutes-of-grep to a single filtered query.
- 100% of monitor runs and detected pages persisted and retrievable (no more lost `.tmp` data).
- Silent-breakage detection: operators are alerted to a competitor returning 0 results for N consecutive runs.
- Adoption: leadership opens the dashboard from Slack deep links; weekly active viewers.
- Operator can add/edit a competitor and trigger a run without touching Python or redeploying.

## 9. Phasing

**Phase 1 — Persistence + archive (MVP).** Stand up DB + FastAPI; refactor pipeline to write to DB; build the archive feed with filters/search and item detail. Add deep links to Slack. *This alone closes the biggest gap (history + search).*

**Phase 2 — Ops console.** Run history, per-competitor health, error surfacing, manual trigger, competitor CRUD, auth + role gating.

**Phase 3 — Analytics hub.** Time-series, heatmap, cadence, momentum, leaderboards.

**Phase 4 — Polish & hooks.** Saved views, export, and a hook for the roadmap's Linear ticket creation from a dashboard item.

## 10. Open questions
- **Hosting/deploy target** — internal infra vs. a managed host? (Affects auth choice.)
- **Auth provider** — Telnyx Google SSO, or a lightweight internal gateway?
- **Backfill** — replay existing `.tmp/competitor_monitor_*.json` into the new DB on launch, or start fresh?
- **Retention** — keep all pages/runs indefinitely, or age out raw `text_preview` after N months to control size?
- **Run trigger security** — who can trigger manual runs and edit competitor config (role boundary)?
- **Annotations (v2?)** — should leadership be able to tag/star/comment on items, or override Claude's category?
```

