/**
 * Idempotent schema migrator for the competitor_intel database.
 *
 * Applies db/migrations/*.sql in filename order, recording each in schema_migrations
 * and skipping versions already applied — so it's safe to run on every deploy/boot or
 * as a one-off K8s Job. Each .sql file owns its own BEGIN/COMMIT (see db/migrations),
 * so this runner does not wrap them; it only decides whether to run them.
 *
 * Usage:
 *   DATABASE_URL=postgres://…/competitor_intel node server/db/migrate.js
 *   (or `npm run migrate` from server/)  ·  programmatic: `await migrate()`
 *
 * Override the migrations dir with MIGRATIONS_DIR (defaults to ../../db/migrations).
 */
import pg from 'pg';
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const MIG_DIR = process.env.MIGRATIONS_DIR || join(__dir, '../../db/migrations');

export async function migrate({ dir = MIG_DIR, log = console.log } = {}) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const applied = new Set(
      (await client.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version),
    );
    const files = readdirSync(dir).filter((f) => /^\d.*\.sql$/.test(f)).sort();
    const ran = [];
    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      if (applied.has(version)) { log(`• skip ${version} (already applied)`); continue; }
      log(`▸ applying ${version} …`);
      await client.query(readFileSync(join(dir, file), 'utf8')); // file does its own BEGIN/COMMIT + records itself
      ran.push(version);
      log(`✓ applied ${version}`);
    }
    log(ran.length ? `migrate: applied ${ran.length} (${ran.join(', ')})` : 'migrate: up to date, nothing to apply');
    return ran;
  } finally {
    await client.end();
  }
}

// Run when invoked directly (not when imported). realpath both sides so a symlinked
// path (e.g. macOS /tmp → /private/tmp) doesn't cause a silent no-op.
const invokedDirectly = (() => {
  try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
})();
if (invokedDirectly) {
  migrate().catch((e) => { console.error('migrate failed:', e.message); process.exit(1); });
}
