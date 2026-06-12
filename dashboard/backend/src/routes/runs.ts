import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { startRun, getJob, listJobs } from "../runner.js";

export const runsRouter = Router();

/** GET /api/runs — run history (PRD §5.2). */
runsRouter.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20)));

  const [total, rows] = await Promise.all([
    prisma.run.count(),
    prisma.run.findMany({
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        runCompetitors: { select: { newPageCount: true, relevantCount: true } },
      },
    }),
  ]);

  res.json({
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    items: rows.map((r) => ({
      id: r.id,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      hoursWindow: r.hoursWindow,
      status: r.status,
      trigger: r.trigger,
      slackStatus: r.slackStatus,
      emailStatus: r.emailStatus,
      competitorsChecked: r.runCompetitors.length,
      newPages: r.runCompetitors.reduce((s, c) => s + c.newPageCount, 0),
      relevant: r.runCompetitors.reduce((s, c) => s + c.relevantCount, 0),
    })),
  });
});

// Job-trigger routes are registered before "/:id" so "jobs" isn't parsed as an id.

const triggerSchema = z.object({
  hours: z.number().int().positive().max(24 * 90).optional(),
  competitor: z.string().min(1).optional(),
  competitors: z.array(z.string().min(1)).max(50).optional(),
  noSlack: z.boolean().optional(),
  noClassify: z.boolean().optional(),
  requireInference: z.boolean().optional(),
}).refine((v) => !(v.noClassify && v.requireInference), {
  message: "requireInference cannot be used with noClassify",
});

/** POST /api/runs — trigger a manual run (async). Returns a job to poll. */
runsRouter.post("/", async (req, res) => {
  const parsed = triggerSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const job = await startRun(parsed.data);
  res.status(202).json({ jobId: job.id, status: job.status });
});

/** GET /api/runs/jobs — list trigger jobs (most recent first). */
runsRouter.get("/jobs", (_req, res) => {
  res.json({ items: listJobs() });
});

/** GET /api/runs/jobs/:id — poll a manual trigger job. */
runsRouter.get("/jobs/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "job not found" });
  res.json(job);
});

/** GET /api/runs/:id — run detail + digest + per-competitor results (PRD §5.2). */
runsRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const run = await prisma.run.findUnique({
    where: { id },
    include: {
      runCompetitors: {
        include: { competitor: { select: { id: true, name: true } } },
      },
    },
  });

  if (!run) return res.status(404).json({ error: "not found" });

  res.json({
    id: run.id,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    hoursWindow: run.hoursWindow,
    status: run.status,
    trigger: run.trigger,
    digestText: run.digestText,
    slackStatus: run.slackStatus,
    emailStatus: run.emailStatus,
    errorSummary: run.errorSummary,
    competitors: run.runCompetitors.map((rc) => ({
      competitor: rc.competitor,
      totalSitemapUrls: rc.totalSitemapUrls,
      newPageCount: rc.newPageCount,
      relevantCount: rc.relevantCount,
      checkedAt: rc.checkedAt,
      status: rc.status,
      error: rc.error,
    })),
  });
});
