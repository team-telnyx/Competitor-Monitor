# `integration/` — plg-dashboard-bound consumer code

Plain-JS ESM (their convention) + the eventual frontend rewire. These files are staged
here mirroring the target tree; they get copied into a `team-telnyx/plg-dashboard` PR.
The Python producer (`tools/write_db.py`) and the SQL contract (`db/migrations/`) live
at this repo's root. Full strategy: [docs/plg-dashboard-integration.md](../docs/plg-dashboard-integration.md).

## File map (staged here → target in plg-dashboard)

| Staged | Target | Status |
|---|---|---|
| `server/db/competitive.js` | `server/db/competitive.js` | ✅ built + validated against real data |
| `server/routes/competitive.js` | `server/routes/competitive.js` | ✅ built (copy of `inference.js` shape) |
| `server/refreshCompetitive.js` | merge into `server/scheduler.js` | ✅ built |
| `app/...` (frontend rewire) | `app/src/services/competitiveApi.ts` + `app/src/pages/CompetitiveIntelligence.tsx` | ⬜ next |

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

**`server/package.json`** — add `"pg": "^8.13.0"` (see this dir's `package.json`).

**Env** — `DATABASE_URL` (from the `pg-role-competitor-intel` secret / Vault) for both
the server and the Python worker.

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
