import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma, CATEGORY_COLORS, CATEGORIES as CATEGORY_LIST } from "../db.js";

export const pagesRouter = Router();

function colorFor(category?: string | null): string {
  if (!category) return "#95a5a6";
  return CATEGORY_COLORS[category] ?? "#95a5a6";
}

const CATEGORIES = [...CATEGORY_LIST, "Not Relevant"] as const;
const REASON_CATEGORIES = [
  "marketing", "customer_story", "careers_or_legal", "wrong_subdomain",
  "duplicate", "wrong_product", "wrong_category", "not_a_release", "other",
] as const;

const feedbackSchema = z
  .object({
    action: z.enum(["confirm", "flag_irrelevant", "recategorize", "reassign_product"]),
    reasonCategory: z.enum(REASON_CATEGORIES).optional(),
    reason: z.string().trim().max(2000).optional(),
    category: z.enum(CATEGORIES).optional(),
    product: z.string().trim().max(200).optional(),
    operator: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.action !== "recategorize" || !!v.category, {
    message: "recategorize requires a category",
  })
  .refine((v) => v.action !== "reassign_product" || v.product !== undefined, {
    message: "reassign_product requires a product",
  });

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
      relevanceScore: p.classification?.relevanceScore ?? null,
      signalType: p.classification?.signalType ?? null,
      product: p.classification?.product ?? null,
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
          relevanceScore: p.classification.relevanceScore,
          signalType: p.classification.signalType,
          product: p.classification.product,
          category: p.classification.category,
          categoryColor: colorFor(p.classification.category),
          summary: p.classification.summary,
          reasoning: p.classification.reasoning,
          model: p.classification.model,
          rubricVersion: p.classification.rubricVersion,
          classifiedAt: p.classification.classifiedAt,
        }
      : null,
    detectedByRunId: p.runCompetitor?.runId ?? null,
    firstSeenRun: p.firstSeenRun,
  });
});

/**
 * POST /api/pages/:id/feedback — record an operator action and immediately
 * correct this page's classification (docs/inference-training.md §5). The stored
 * Feedback row is the durable record that Phase C turns into rules + examples.
 */
pagesRouter.post("/:id/feedback", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "invalid id" });

  const parsed = feedbackSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const d = parsed.data;

  const page = await prisma.page.findUnique({
    where: { id },
    include: { classification: true },
  });
  if (!page) return res.status(404).json({ error: "page not found" });

  // Immediate correction to this page's classification.
  const update: Prisma.ClassificationUpdateInput = {};
  if (d.action === "flag_irrelevant") {
    update.relevant = false;
    update.signalType = "irrelevant";
  } else if (d.action === "recategorize") {
    update.category = d.category;
  } else if (d.action === "reassign_product") {
    update.product = d.product || null;
    // If the new product is in the registry, lock its category too.
    if (d.product) {
      const known = await prisma.product.findUnique({
        where: { competitorId_name: { competitorId: page.competitorId, name: d.product } },
        select: { category: true },
      });
      if (known?.category) update.category = known.category;
    }
  }

  if (Object.keys(update).length > 0 && page.classification) {
    await prisma.classification.update({ where: { pageId: id }, data: update });
  }

  const feedback = await prisma.feedback.create({
    data: {
      pageId: id,
      competitorId: page.competitorId,
      action: d.action,
      reasonCategory: d.reasonCategory ?? null,
      reason: d.reason ?? null,
      operator: d.operator ?? null,
    },
  });

  res.status(201).json({ ok: true, feedbackId: feedback.id });
});
