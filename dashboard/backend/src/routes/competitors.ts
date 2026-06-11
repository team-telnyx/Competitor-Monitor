import { Router } from "express";
import { prisma, decodeStringArray } from "../db.js";

export const competitorsRouter = Router();

/** GET /api/competitors — list + health (PRD §5.2). */
competitorsRouter.get("/", async (_req, res) => {
  const competitors = await prisma.competitor.findMany({
    orderBy: { name: "asc" },
  });

  const items = await Promise.all(
    competitors.map(async (c) => {
      const [lastChecked, lastPage, totalPages, recentRcs] = await Promise.all([
        prisma.runCompetitor.findFirst({
          where: { competitorId: c.id, checkedAt: { not: null } },
          orderBy: { checkedAt: "desc" },
          select: { checkedAt: true },
        }),
        prisma.page.findFirst({
          where: { competitorId: c.id },
          orderBy: { scrapedAt: "desc" },
          select: { scrapedAt: true },
        }),
        prisma.page.count({ where: { competitorId: c.id } }),
        prisma.runCompetitor.findMany({
          where: { competitorId: c.id },
          orderBy: { id: "desc" },
          take: 5,
          select: { newPageCount: true },
        }),
      ]);

      // Flag possible silent breakage: returned 0 new pages for the last N runs.
      let consecutiveZero = 0;
      for (const rc of recentRcs) {
        if (rc.newPageCount === 0) consecutiveZero++;
        else break;
      }

      return {
        id: c.id,
        name: c.name,
        active: c.active,
        sitemapUrls: decodeStringArray(c.sitemapUrls),
        includePatterns: decodeStringArray(c.includePatterns),
        excludePatterns: decodeStringArray(c.excludePatterns),
        useSnapshotDiff: c.useSnapshotDiff,
        detectionMethod: c.useSnapshotDiff ? "snapshot_diff" : "lastmod",
        health: {
          lastChecked: lastChecked?.checkedAt ?? null,
          lastNewPage: lastPage?.scrapedAt ?? null,
          totalPagesArchived: totalPages,
          consecutiveZeroRuns: consecutiveZero,
          possibleSilentBreak: consecutiveZero >= 3,
        },
      };
    }),
  );

  res.json({ items });
});
