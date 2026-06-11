import { Router } from "express";
import { prisma } from "../db.js";

export const analyticsRouter = Router();

/**
 * GET /api/analytics/activity?from=&to=&groupBy=day|week
 * Updates over time, total + per focus area (PRD §5.3). Relevant pages only.
 */
analyticsRouter.get("/activity", async (req, res) => {
  const { from, to } = req.query as Record<string, string | undefined>;
  const groupBy = req.query.groupBy === "week" ? "week" : "day";

  const where: any = {
    classification: { is: { relevant: true } },
  };
  if (from || to) {
    where.scrapedAt = {};
    if (from) where.scrapedAt.gte = new Date(from);
    if (to) where.scrapedAt.lte = new Date(to);
  }

  const pages = await prisma.page.findMany({
    where,
    select: { scrapedAt: true, classification: { select: { category: true } } },
  });

  const bucketKey = (d: Date): string => {
    const iso = d.toISOString().slice(0, 10);
    if (groupBy === "day") return iso;
    // ISO week bucket: shift to the Monday of that week
    const day = new Date(d);
    const weekday = (day.getUTCDay() + 6) % 7;
    day.setUTCDate(day.getUTCDate() - weekday);
    return day.toISOString().slice(0, 10);
  };

  const buckets = new Map<string, { total: number; byCategory: Record<string, number> }>();
  for (const p of pages) {
    if (!p.scrapedAt) continue;
    const key = bucketKey(p.scrapedAt);
    const b = buckets.get(key) ?? { total: 0, byCategory: {} };
    b.total += 1;
    const cat = p.classification?.category ?? "Other";
    b.byCategory[cat] = (b.byCategory[cat] ?? 0) + 1;
    buckets.set(key, b);
  }

  const series = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, total: v.total, byCategory: v.byCategory }));

  res.json({ groupBy, series });
});

/**
 * GET /api/analytics/heatmap — competitor × focus area counts (PRD §5.3).
 */
analyticsRouter.get("/heatmap", async (_req, res) => {
  const pages = await prisma.page.findMany({
    where: { classification: { is: { relevant: true } } },
    select: {
      competitor: { select: { name: true } },
      classification: { select: { category: true } },
    },
  });

  const matrix = new Map<string, Map<string, number>>();
  for (const p of pages) {
    const comp = p.competitor.name;
    const cat = p.classification?.category ?? "Other";
    const row = matrix.get(comp) ?? new Map<string, number>();
    row.set(cat, (row.get(cat) ?? 0) + 1);
    matrix.set(comp, row);
  }

  res.json({
    cells: [...matrix.entries()].flatMap(([competitor, row]) =>
      [...row.entries()].map(([category, count]) => ({
        competitor,
        category,
        count,
      })),
    ),
  });
});
