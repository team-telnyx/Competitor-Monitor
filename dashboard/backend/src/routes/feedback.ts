import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma, CATEGORY_COLORS } from "../db.js";

export const feedbackRouter = Router();

const THRESHOLD = 40; // mirrors RELEVANCE_THRESHOLD in tools/inference.py

function colorFor(category?: string | null): string {
  if (!category) return "#95a5a6";
  return CATEGORY_COLORS[category] ?? "#95a5a6";
}

/**
 * GET /api/feedback/queue — the review queue. Mirrors the Feed (scored, relevant
 * items, newest first, paginated) rather than a low-confidence subset, so the
 * operator can review the whole set and establish a baseline. Each item carries a
 * `reviewed` flag (whether it already has feedback). Filters: competitor,
 * relevant (true|false|all), page, pageSize.
 */
feedbackRouter.get("/queue", async (req, res) => {
  const competitor = req.query.competitor as string | undefined;
  const relevant = (req.query.relevant as string | undefined) ?? "true";
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 25)));

  // Mirror /api/pages exactly: only constrain on relevance when asked (relevant=all
  // includes legacy/unscored items too, so the queue == the feed).
  const where: Prisma.PageWhereInput = {};
  if (relevant === "true") where.classification = { is: { relevant: true } };
  else if (relevant === "false") where.classification = { is: { relevant: false } };
  if (competitor) {
    const asId = Number(competitor);
    where.competitor = Number.isInteger(asId) ? { id: asId } : { name: competitor };
  }

  const [total, rows] = await Promise.all([
    prisma.page.count({ where }),
    prisma.page.findMany({
      where,
      include: {
        competitor: true,
        classification: true,
        _count: { select: { feedback: true } },
      },
      orderBy: { scrapedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const items = rows.map((p) => ({
    pageId: p.id,
    competitor: { id: p.competitor.id, name: p.competitor.name },
    url: p.url,
    title: p.title ?? p.url,
    product: p.classification?.product ?? null,
    category: p.classification?.category ?? null,
    categoryColor: colorFor(p.classification?.category),
    signalType: p.classification?.signalType ?? null,
    relevanceScore: p.classification?.relevanceScore ?? null,
    relevant: p.classification?.relevant ?? false,
    summary: p.classification?.summary ?? null,
    reasoning: p.classification?.reasoning ?? null,
    scrapedAt: p.scrapedAt,
    reviewed: p._count.feedback > 0,
  }));

  res.json({
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    threshold: THRESHOLD,
  });
});
