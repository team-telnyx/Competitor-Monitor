/**
 * CLI: ingest a pipeline JSON artifact into the dashboard DB.
 *
 *   npm run ingest -- ../../.tmp/competitor_monitor_20260610_130000.json
 *
 * Useful for backfilling existing runs and for the scheduled (cron) pipeline:
 * have cron run the Python pipeline, then pipe the artifact through this.
 */
import { prisma } from "../db.js";
import { ingestRunFile } from "../ingest.js";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: npm run ingest -- <path-to-competitor_monitor_*.json>");
    process.exit(1);
  }
  const trigger = process.argv.includes("--manual") ? "manual" : "scheduled";
  const result = await ingestRunFile(file, { trigger });
  console.log(
    `Ingested run #${result.runId}: ${result.pages} pages (${result.relevant} relevant).`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
