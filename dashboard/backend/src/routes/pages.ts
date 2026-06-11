import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma, CATEGORY_COLORS } from "../db.js";

export const pagesRouter = Router();

function colorFor(category?: string | null): string {
  if (!category) return "#95a5a6";
  return CATEGORY_COLORS[category] ?? "#95a5a6";
}

/**
 * GET /api/pages
 * Archive feed + search (PRD §5.1).
 * Query: competitor, category, from, to, q, relevant=true|false|all,
 *        source, page, pageSize
 */
pagesRouter.get("/", async (req, res) => {
  const {
    competitor,
    category,
    from,
    to,
    q,
    relevant = "true",
    source,
  } = req.query as Record<string, string | undefined>;

  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20)));

  const where: Prisma.PageWhereInput = {};

  if (competitor) {
    const asId = Number(competitor);
    where.competitor = Number.isInteger(asId)
      ? { id: asId }
      : { name: competitor };
  }

  const classificationFilter: Prisma.ClassificationWhereInput = {};
  if (relevant === "true") classificationFilter.relevant = true;
  else if (relevant === "false") classificationFilter.relevant = false;
  if (category) classificationFilter.category = category;
  if (Object.keys(classificationFilter).length > 0) {
    where.classification = { is: classificationFilter };
  }

  if (source) where.detectionSource = source;

  if (from || to) {
    where.scrapedAt = {};
    if (from) where.scrapedAt.gte = new Date(from);
    if (to) where.scrapedAt.lte = new Date(to);
  }

  if (q) {
    where.OR = [
      { title: { contains: q } },
      { description: { contains: q } },
      { textPreview: { contains: q } },
      { classification: { is: { summary: { contains: q } } } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.page.count({ where }),
    prisma.page.findMany({
      where,
      include: { competitor: true, classification: true },
      orderBy: { scrapedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  res.json({
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    items: rows.map((p) => ({
      id: p.id,
      competitor: { id: p.competitor.id, name: p.competitor.name },
      url: p.url,
      title: p.title ?? p.url,
      summary: p.classification?.summary ?? p.description ?? null,
      category: p.classification?.category ?? null,
      categoryColor: colorFor(p.classification?.category),
      relevant: p.classification?.relevant ?? false,
      detectionSource: p.detectionSource,
      lastmod: p.lastmod,
      scrapedAt: p.scrapedAt,
      firstSeenRunId: p.firstSeenRunId,
    })),
  });
});

/** GET /api/pages/:id — item detail (PRD §5.1). */
pagesRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const p = await prisma.page.findUnique({
    where: { id },
    include: {
      competitor: true,
      classification: true,
      firstSeenRun: { select: { id: true, startedAt: true, trigger: true } },
      runCompetitor: { select: { runId: true } },
    },
  });

  if (!p) return res.status(404).json({ error: "not found" });

  res.json({
    id: p.id,
    competitor: { id: p.competitor.id, name: p.competitor.name },
    url: p.url,
    title: p.title ?? p.url,
    description: p.description,
    textPreview: p.textPreview,
    textLength: p.textLength,
    detectionSource: p.detectionSource,
    lastmod: p.lastmod,
    scrapedAt: p.scrapedAt,
    classification: p.classification
      ? {
          relevant: p.classification.relevant,
          category: p.classification.category,
          categoryColor: colorFor(p.classification.category),
          summary: p.classification.summary,
          model: p.classification.model,
          classifiedAt: p.classification.classifiedAt,
        }
      : null,
    detectedByRunId: p.runCompetitor?.runId ?? null,
    firstSeenRun: p.firstSeenRun,
  });
});
