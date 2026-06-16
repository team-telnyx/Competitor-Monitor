/**
 * refreshCompetitive() — re-reads Neon and refreshes the 'competitive' file cache.
 *
 * This is CHEAP (a few indexed Postgres queries) and is the only "refresh" that runs
 * inside the plg-ops server — fold it into the existing 30-min scheduler cycle and the
 * POST /api/refresh handler, alongside refreshDashboard/refreshSignals/etc.
 *
 * The EXPENSIVE work — crawling competitor sites + LLM classification — is the separate
 * Python pipeline worker (tools/write_neon.py on the Mac Mini → K8s CronJob later) that
 * WRITES Neon on its own slower cadence. The two are decoupled by the database; this
 * function only ever reads.
 *
 * Wiring (edits to server/scheduler.js):
 *   import { buildCompetitivePayload } from './db/competitive.js';
 *   // inside refreshAll(): await refreshCompetitive();  (Promise.allSettled with the rest)
 *   // and export refreshCompetitive so POST /api/refresh can call it.
 *
 * Target location: merge into server/scheduler.js (shown standalone for clarity).
 */
import { writeCache } from './cache.js';
import { buildCompetitivePayload } from './db/competitive.js';

export async function refreshCompetitive() {
  const payload = await buildCompetitivePayload();
  writeCache('competitive', payload);
  return {
    feed: payload.feed.length,
    companies: payload.companies.length,
    categories: payload.categories.length,
  };
}
