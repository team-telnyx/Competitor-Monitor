# Competitor Intelligence Dashboard

Phase 1 (Persistence + Archive MVP) of [the dashboard PRD](../docs/dashboard_prd.md).

Gives the competitor-monitor pipeline a durable, queryable home: every detected
page and run is persisted, and a web archive makes it browsable, searchable, and
filterable — closing the biggest gap (no history / no search beyond the daily
Slack push).

## Architecture

```
React (Vite + TS)  ──HTTP/JSON──►  Express (Node + TS)  ──Prisma──►  SQLite
  frontend/  :5173                   backend/  :4000                  dev.db
                                        │
                                        └─ spawns: python3 tools/competitor_monitor.py
                                           then ingests the JSON artifact it writes
```

- **Backend** (`backend/`) — Express + Prisma JSON API. Owns the DB and triggers
  pipeline runs by spawning the existing Python scraper as a subprocess.
- **Frontend** (`frontend/`) — React archive feed with filters, full-text search,
  and an item-detail drawer.
- **DB** — SQLite by default (zero setup). To move to Postgres (PRD §10), set
  `provider = "postgresql"` in `backend/prisma/schema.prisma` and point
  `DATABASE_URL` at your instance; the model is portable as-is.

## Run it

**Backend** (terminal 1):

```bash
cd dashboard/backend
npm install
cp .env.example .env
npx prisma db push        # create the SQLite schema
npm run seed -- --demo    # seed competitors + one demo run (drop --demo for empty)
npm run dev               # http://localhost:4000
```

**Frontend** (terminal 2):

```bash
cd dashboard/frontend
npm install
npm run dev               # http://localhost:5173
```

Open http://localhost:5173.

## Getting real data in

The dashboard reads what `tools/competitor_monitor.py` produces. To enable LLM
classification/digests from dashboard-triggered runs, set `OPENAI_API_KEY` in the
repo-root `.env` (or in the backend process environment).

- **Manual trigger (UI/API):** `POST /api/runs` spawns the pipeline and ingests
  the result automatically (async — poll `GET /api/runs/jobs/:id`).
- **Scheduled (cron):** run the pipeline as usual, then ingest its artifact:
  ```bash
  cd dashboard/backend
  npm run ingest -- ../../.tmp/competitor_monitor_<timestamp>.json
  ```

## API surface (Phase 1)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/pages` | Archive feed + search/filter (`competitor`, `category`, `q`, `relevant`, `from`, `to`, `page`) |
| GET | `/api/pages/:id` | Item detail (scraped preview, classification, run) |
| GET | `/api/runs` | Run history |
| GET | `/api/runs/:id` | Run detail + digest + per-competitor results |
| POST | `/api/runs` | Trigger a manual run (async) |
| GET | `/api/runs/jobs/:id` | Poll a manual-run job |
| GET | `/api/competitors` | Competitor list + health (silent-breakage flag) |
| GET | `/api/analytics/activity` | Updates over time, per focus area |
| GET | `/api/analytics/heatmap` | Competitor × focus-area counts |

## Status vs. the PRD

- **Phase 1 (this):** DB + persistence + ingest, archive feed with filters/search
  + item detail, manual-run trigger, the API spine for runs/competitors/analytics.
- **Not yet (Phase 2–4):** auth + role gating, full ops console UI, competitor
  CRUD writes, analytics charts UI, Slack deep links. The API endpoints those
  build on are scaffolded.
