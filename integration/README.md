# `integration/` — plg-dashboard-bound consumer code

Plain-JS ESM (their convention) + the eventual frontend rewire. These files are staged
here mirroring the target tree; they get copied into a `team-telnyx/plg-dashboard` PR.
The Python producer (`tools/write_db.py`) and the SQL contract (`db/migrations/`) live
at this repo's root. Full strategy: [docs/plg-dashboard-integration.md](../docs/plg-dashboard-integration.md).

## File map (staged here → target in plg-dashboard)

| Staged | Target | Status |
|---|---|---|
| `server/db/competitive.js` | `server/db/competitive.js` | ✅ feed/companies/categories, source detail, training, approvals, products |
| `server/db/export-config.js` | `server/db/export-config.js` | ✅ exports DB config → pipeline `--config` (closes the training loop) |
| `server/db/migrate.js` | `server/db/migrate.js` | ✅ idempotent migration runner |
| `server/routes/competitive.js` | `server/routes/competitive.js` | ✅ reads + writes (feedback, guidance, approvals, products, pipeline trigger) |
| `server/pipeline.js` | `server/pipeline.js` | ✅ async pipeline runner + status polling |
| `server/refreshCompetitive.js` | merge into `server/scheduler.js` | ✅ built |
| `app/src/services/competitiveApi.ts` | same | ✅ staged |
| `app/src/pages/CompetitiveIntelligence.tsx` | same | ✅ staged (Feed/Companies/Categories/Training/Sources, filters, run controls) |
| `app/src/components/competitive/*.tsx` | same | ✅ staged (SourcesTab, TrainingTab, SourceDetail, CompetitorDetail, DateRange) |
| `pipeline/run-local.sh` | `pipeline/run-local.sh` | ✅ local `COMPETITIVE_PIPELINE_CMD` helper (exports DB config → runs worker) |

## Small edits to their existing files

**`server/index.js`** — register the router + health key:
```js
import competitiveRouter from './routes/competitive.js';
app.use('/api/competitive', competitiveRouter);
// in /api/health: add 'competitive' to the keys array
```

**`server/scheduler.js`** — add the refresh to the cycle:
```js
import { buildCompetitivePayload } from './db/competitive.js';
import { writeCache } from './cache.js';
export async function refreshCompetitive() {
  const payload = await buildCompetitivePayload();
  writeCache('competitive', payload);
  return { feed: payload.feed.length };
}
// inside refreshAll(): include refreshCompetitive() in the Promise.allSettled set
```

**`server/seed-cache.js`** (optional) — a last-known-good `competitive` block so the page
renders before the first refresh (same idea as their `dashboard`/`signals` seeds).

**`server/package.json`** — add `"pg": "^8.13.0"` (see this dir's `package.json`) and a
`"migrate": "node db/migrate.js"` script.

**Env** — `DATABASE_URL` (from the `pg-role-competitor-intel` secret / Vault) for both
the server and the Python worker; `COMPETITIVE_PIPELINE_CMD` to point the "Run pipeline"
trigger at the run helper (local) or the K8s Job (prod).

## Training loop (operator input → next run)
The dashboard records guidance, feedback, approvals, and tracked products into Postgres.
`server/db/export-config.js` reads the active competitors (sources, exclude patterns,
products → `known_products`, global + per-competitor guidance, and few-shot `examples`
derived from feedback) and writes the JSON the pipeline's `--config` consumes;
`pipeline/run-local.sh` exports it before each run. Verified injecting into the classify
prompt. Bootstrap the DB's sources/detection once from the built-in config with
`tools/sync_competitor_config.py` (DB is the source of truth thereafter).

## Validation done here
- `db/migrations/*.sql` apply clean to Postgres; CHECK/FK/triggers enforce.
- `tools/write_db.py` ingests a real pipeline run (72 pages, 31 relevant) and is
  idempotent across re-runs.
- `server/db/competitive.js` returns correct feed/companies/categories from that data
  (run via Node + `pg` against a real Postgres).

## Architecture reminder — two separate "refreshes"
- **Pipeline worker** (Python, slow, external sites + LLM, hourly/daily) → *writes* Postgres.
- **`refreshCompetitive()`** (server, cheap, every 30 min) → *reads* Postgres → file cache.
Routes serve only from cache. The DB decouples the two.
