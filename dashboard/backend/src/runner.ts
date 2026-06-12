import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config, envWithLocalVariables, REPO_ROOT } from "./config.js";
import { ingestRunFile } from "./ingest.js";
import { prisma, decodeStringArray } from "./db.js";

export interface RunRequest {
  hours?: number;
  competitor?: string;
  competitors?: string[];
  noSlack?: boolean;
  noClassify?: boolean;
  requireInference?: boolean;
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

function logTail(job: Job): string {
  return job.log
    .join("")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-2)
    .join(" ");
}

/**
 * Export the active competitors (the dashboard is the source of truth) to a JSON
 * file the pipeline reads via --config. Returns the path, or null when there are
 * no active competitors so the caller can fall back to the pipeline's built-in
 * list rather than scraping nothing.
 */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/** Recent operator corrections as compact few-shot examples for the classifier. */
async function recentExamples(competitorId: number) {
  const fb = await prisma.feedback.findMany({
    where: { competitorId },
    orderBy: { id: "desc" },
    take: 8,
    include: { page: { include: { classification: true } } },
  });
  return fb.map((f) => {
    const c = f.page.classification;
    let verdict = "";
    if (f.action === "flag_irrelevant") verdict = "irrelevant";
    else if (f.action === "confirm") verdict = c?.relevant ? "relevant" : "not relevant";
    else if (f.action === "recategorize") verdict = `category=${c?.category ?? "?"}`;
    else if (f.action === "reassign_product") verdict = `product=${c?.product ?? "?"}`;
    return {
      title: f.page.title ?? f.page.url,
      host: hostOf(f.page.url),
      verdict,
      reason: f.reason ?? f.reasonCategory ?? null,
    };
  });
}

async function writeActiveCompetitorConfig(): Promise<string | null> {
  const competitors = await prisma.competitor.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    // Known products feed the classifier's registry (deterministic product match).
    include: {
      products: {
        where: { status: { not: "deprecated" } },
        orderBy: { name: "asc" },
      },
    },
  });
  if (competitors.length === 0) return null;

  // Global guidance applies to every competitor; per-competitor guidance is merged in.
  const guidance = await prisma.guidance.findMany({ where: { active: true } });
  const globalGuidance = guidance.filter((g) => g.competitorId === null).map((g) => g.text);
  const guidanceByCompetitor = new Map<number, string[]>();
  for (const g of guidance) {
    if (g.competitorId === null) continue;
    const list = guidanceByCompetitor.get(g.competitorId) ?? [];
    list.push(g.text);
    guidanceByCompetitor.set(g.competitorId, list);
  }

  const exported = await Promise.all(
    competitors.map(async (c) => ({
      name: c.name,
      sitemap_urls: decodeStringArray(c.sitemapUrls),
      include_patterns: decodeStringArray(c.includePatterns),
      exclude_patterns: decodeStringArray(c.excludePatterns),
      ignored_subdomains: decodeStringArray(c.ignoredSubdomains),
      products: c.products.map((p) => ({
        name: p.name,
        category: p.category,
        aliases: decodeStringArray(p.aliases),
      })),
      guidance: [...globalGuidance, ...(guidanceByCompetitor.get(c.id) ?? [])],
      examples: await recentExamples(c.id),
      use_snapshot_diff: c.useSnapshotDiff,
    })),
  );

  fs.mkdirSync(config.pipelineOutputDir, { recursive: true });
  const configPath = path.join(config.pipelineOutputDir, "competitors_config.json");
  fs.writeFileSync(configPath, JSON.stringify(exported, null, 2));
  return configPath;
}

/**
 * Kick off a pipeline run as a detached async job. Returns immediately with a
 * job whose status can be polled at GET /api/runs/jobs/:id (PRD §7: async job +
 * status polling so the UI doesn't block on a multi-minute scrape).
 */
export async function startRun(req: RunRequest): Promise<Job> {
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
  const competitorConfig = await writeActiveCompetitorConfig();
  if (competitorConfig) args.push("--config", competitorConfig);
  // Scope to one or many competitors (pipeline --competitor is repeatable).
  const scoped = req.competitors?.length ? req.competitors : req.competitor ? [req.competitor] : [];
  for (const c of scoped) args.push("--competitor", c);
  if (req.noSlack) args.push("--no-slack");
  if (req.noClassify) args.push("--no-classify");
  if (req.requireInference) args.push("--require-inference");

  const child = spawn(config.pythonBin, args, {
    cwd: REPO_ROOT,
    env: envWithLocalVariables(),
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
      const tail = logTail(job);
      job.error = `Pipeline exited with code ${code}${tail ? `: ${tail}` : ""}`;
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
