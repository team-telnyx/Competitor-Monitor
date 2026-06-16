/**
 * Pipeline runner — lets the UI force a competitor-monitor run on demand and reports
 * timing/status. The actual command is pluggable via COMPETITIVE_PIPELINE_CMD so prod
 * can point it at the K8s Job trigger (the prod image is Python-free); locally it runs
 * the Python worker directly. We time wall-clock here because the runs table only stores
 * the crawl timestamp, not duration. Last status is cached so it survives restarts.
 */
import { spawn } from 'node:child_process';
import { writeCache, readCache } from './cache.js';
import { buildCompetitivePayload } from './db/competitive.js';

let running = false;
let startedAt = null;
let stderrTail = '';

export function pipelineStatus() {
  const last = readCache('pipeline_status')?.data ?? null;
  return {
    running,
    startedAt: startedAt ? new Date(startedAt).toISOString() : null,
    elapsedMs: running && startedAt ? Date.now() - startedAt : null,
    last, // { lastStartedAt, lastFinishedAt, durationMs, status, exitCode }
  };
}

export function runPipeline() {
  if (running) return { alreadyRunning: true, ...pipelineStatus() };
  const cmd = process.env.COMPETITIVE_PIPELINE_CMD;
  if (!cmd) return { error: 'pipeline command not configured (set COMPETITIVE_PIPELINE_CMD)' };

  running = true;
  startedAt = Date.now();
  stderrTail = '';
  const child = spawn('bash', ['-lc', cmd], { env: process.env, stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', (d) => { stderrTail = (stderrTail + d.toString()).slice(-2000); });

  const finish = async (status, exitCode) => {
    if (!running) return;
    const durationMs = Date.now() - startedAt;
    writeCache('pipeline_status', {
      lastStartedAt: new Date(startedAt).toISOString(),
      lastFinishedAt: new Date().toISOString(),
      durationMs, status, exitCode,
      error: status === 'failed' ? stderrTail.slice(-500) : null,
    });
    running = false;
    // Surface the freshly-written rows: rebuild the competitive cache.
    if (status === 'success') { try { writeCache('competitive', await buildCompetitivePayload()); } catch { /* ignore */ } }
  };

  child.on('exit', (code) => finish(code === 0 ? 'success' : 'failed', code));
  child.on('error', () => finish('failed', -1));
  return { started: true, ...pipelineStatus() };
}
