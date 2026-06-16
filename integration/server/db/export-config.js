/**
 * Export the active competitor config (sources + rules + products + guidance + few-shot
 * examples) from the DB into the JSON the Python pipeline's --config flag consumes. This
 * is what closes the training loop: operator input recorded in the dashboard reaches the
 * next run. Usage: `node server/db/export-config.js [outfile]` (writes file or stdout).
 */
import { writeFileSync } from 'node:fs';
import { exportPipelineConfig } from './competitive.js';

const out = process.argv[2];
const cfg = await exportPipelineConfig();
const json = JSON.stringify(cfg, null, 2);
if (out) { writeFileSync(out, json); process.stderr.write(`export-config: ${cfg.length} competitors → ${out}\n`); }
else process.stdout.write(json);
process.exit(0); // the pg pool would otherwise keep the process alive
