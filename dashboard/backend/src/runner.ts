import { spawn } from "node:child_process";
import { config } from "./config.js";
import { ingestRunFile } from "./ingest.js";

export interface RunRequest {
  hours?: number;
  noSlack?: boolean;
  noClassify?: boolean;
}

export type JobStatus = "running" | "succeeded" | "failed";

export interface Job {
  id: string;
  status: JobStatus;
  startedAt: string;
  finishedAt?: string;
  runId?: number;
  pagesIngested?: number;
  relevant?: number;
  error?: string;
  log: string[];
}

// In-memory job registry. Fine for a single-process internal tool; swap for a
// durable queue if the dashboard ever runs multi-instance (PRD §10).
const jobs = new Map<string, Job>();
let jobCounter = 0;

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function listJobs(): Job[] {
  return [...jobs.values()].sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );
}

/**
 * Kick off a pipeline run as a detached async job. Returns immediately with a
 * job whose status can be polled at GET /api/runs/jobs/:id (PRD §7: async job +
 * status polling so the UI doesn't block on a multi-minute scrape).
 */
export function startRun(req: RunRequest): Job {
  const id = `job_${++jobCounter}_${Date.now()}`;
  const job: Job = {
    id,
    status: "running",
    startedAt: new Date().toISOString(),
    log: [],
  };
  jobs.set(id, job);

  const args = [
    config.pipelineScript,
    "--hours",
    String(req.hours ?? 24),
    "--output-dir",
    config.pipelineOutputDir,
  ];
  if (req.noSlack) args.push("--no-slack");
  if (req.noClassify) args.push("--no-classify");

  const child = spawn(config.pythonBin, args, {
    cwd: config.pipelineOutputDir.replace(/\/[^/]+$/, "") || ".",
  });

  let stdout = "";
  child.stdout.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    stdout += text;
    job.log.push(text);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    job.log.push(chunk.toString());
  });

  child.on("error", (err) => {
    job.status = "failed";
    job.error = `Failed to spawn pipeline: ${err.message}`;
    job.finishedAt = new Date().toISOString();
  });

  child.on("close", async (code) => {
    if (code !== 0) {
      job.status = "failed";
      job.error = `Pipeline exited with code ${code}`;
      job.finishedAt = new Date().toISOString();
      return;
    }
    // The pipeline prints "Results saved to <path>".
    const match = stdout.match(/Results saved to\s+(.+\.json)/);
    if (!match) {
      job.status = "failed";
      job.error = "Could not locate pipeline output artifact in stdout";
      job.finishedAt = new Date().toISOString();
      return;
    }
    try {
      const result = await ingestRunFile(match[1].trim(), { trigger: "manual" });
      job.status = "succeeded";
      job.runId = result.runId;
      job.pagesIngested = result.pages;
      job.relevant = result.relevant;
    } catch (err) {
      job.status = "failed";
      job.error = `Ingest failed: ${(err as Error).message}`;
    }
    job.finishedAt = new Date().toISOString();
  });

  return job;
}
