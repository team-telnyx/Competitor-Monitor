import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma, encodeJson, decodeStringArray } from "../db.js";

export const competitorsRouter = Router();

// A "source" is a sitemap/feed URL the pipeline crawls for a competitor.
const urlList = z
  .array(z.string().trim().url("Each source must be a valid http(s) URL"))
  .default([]);
const patternList = z.array(z.string().trim().min(1)).default([]);

// An "ignored subdomain" is a hostname whose pages are skipped during detection.
const HOST_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** Normalize user input to a bare hostname (strip scheme, path, dots, case). */
function normalizeHost(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .split("/")[0]
    .split("?")[0]
    .replace(/^\.+|\.+$/g, "");
}

const host = z
  .string()
  .transform(normalizeHost)
  .pipe(
    z
      .string()
      .regex(HOST_RE, "Must be a hostname like community.example.com"),
  );
const subdomainList = z.array(host).default([]);

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  sitemapUrls: urlList,
  includePatterns: patternList,
  excludePatterns: patternList,
  ignoredSubdomains: subdomainList,
  useSnapshotDiff: z.boolean().default(false),
  active: z.boolean().default(true),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    sitemapUrls: urlList.optional(),
    includePatterns: patternList.optional(),
    excludePatterns: patternList.optional(),
    ignoredSubdomains: subdomainList.optional(),
    useSnapshotDiff: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

const sourceSchema = z.object({
  url: z.string().trim().url("Source must be a valid http(s) URL"),
});

const ignoredSubdomainSchema = z.object({ host });

type CompetitorRow = Prisma.CompetitorGetPayload<{}>;

/** Shape a DB row into the API representation (decoding JSON-encoded arrays). */
function serialize(c: CompetitorRow) {
  return {
    id: c.id,
    name: c.name,
    active: c.active,
    sitemapUrls: decodeStringArray(c.sitemapUrls),
    includePatterns: decodeStringArray(c.includePatterns),
    excludePatterns: decodeStringArray(c.excludePatterns),
    ignoredSubdomains: decodeStringArray(c.ignoredSubdomains),
    useSnapshotDiff: c.useSnapshotDiff,
    detectionMethod: c.useSnapshotDiff ? "snapshot_diff" : "lastmod",
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

async function getRowOr404(id: number, res: import("express").Response) {
  const row = await prisma.competitor.findUnique({ where: { id } });
  if (!row) {
    res.status(404).json({ error: "Competitor not found" });
    return null;
  }
  return row;
}

/** GET /api/competitors — list + sources + health (PRD §5.2). */
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
        ...serialize(c),
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

/**
 * GET /api/competitors/overview — per-competitor recent high-relevance activity
 * (PRD §5.2). Returns each active competitor's newest score>=minScore items plus
 * counts, for the Competitors tab.
 */
competitorsRouter.get("/overview", async (req, res) => {
  const minScore = Math.max(0, Number(req.query.minScore ?? 70));
  const take = Math.min(10, Math.max(1, Number(req.query.take ?? 5)));

  const competitors = await prisma.competitor.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: { products: { where: { status: "active" }, select: { name: true, category: true } } },
  });

  const items = await Promise.all(
    competitors.map(async (c) => {
      const [recent, highCount, totalRelevant] = await Promise.all([
        prisma.page.findMany({
          where: { competitorId: c.id, classification: { is: { relevanceScore: { gte: minScore } } } },
          orderBy: { scrapedAt: "desc" },
          take,
          include: { classification: true },
        }),
        prisma.page.count({
          where: { competitorId: c.id, classification: { is: { relevanceScore: { gte: minScore } } } },
        }),
        prisma.page.count({
          where: { competitorId: c.id, classification: { is: { relevant: true } } },
        }),
      ]);

      return {
        id: c.id,
        name: c.name,
        productCount: c.products.length,
        products: c.products.map((p) => ({ name: p.name, category: p.category })),
        highRelevanceCount: highCount,
        relevantCount: totalRelevant,
        recent: recent.map((p) => ({
          id: p.id,
          url: p.url,
          title: p.title ?? p.url,
          product: p.classification?.product ?? null,
          category: p.classification?.category ?? null,
          signalType: p.classification?.signalType ?? null,
          relevanceScore: p.classification?.relevanceScore ?? null,
          scrapedAt: p.scrapedAt,
        })),
      };
    }),
  );

  res.json({ minScore, items });
});

/** POST /api/competitors — add a new competitor (with optional initial sources). */
competitorsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const d = parsed.data;
  try {
    const created = await prisma.competitor.create({
      data: {
        name: d.name,
        sitemapUrls: encodeJson([...new Set(d.sitemapUrls)]),
        includePatterns: encodeJson(d.includePatterns),
        excludePatterns: encodeJson(d.excludePatterns),
        ignoredSubdomains: encodeJson([...new Set(d.ignoredSubdomains)]),
        useSnapshotDiff: d.useSnapshotDiff,
        active: d.active,
      },
    });
    res.status(201).json(serialize(created));
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: `A competitor named "${d.name}" already exists` });
    }
    throw err;
  }
});

/** PATCH /api/competitors/:id — edit name / patterns / detection / active. */
competitorsRouter.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = updateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  if (!(await getRowOr404(id, res))) return;

  const d = parsed.data;
  const data: Prisma.CompetitorUpdateInput = {};
  if (d.name !== undefined) data.name = d.name;
  if (d.sitemapUrls !== undefined) data.sitemapUrls = encodeJson([...new Set(d.sitemapUrls)]);
  if (d.includePatterns !== undefined) data.includePatterns = encodeJson(d.includePatterns);
  if (d.excludePatterns !== undefined) data.excludePatterns = encodeJson(d.excludePatterns);
  if (d.ignoredSubdomains !== undefined) data.ignoredSubdomains = encodeJson([...new Set(d.ignoredSubdomains)]);
  if (d.useSnapshotDiff !== undefined) data.useSnapshotDiff = d.useSnapshotDiff;
  if (d.active !== undefined) data.active = d.active;

  try {
    const updated = await prisma.competitor.update({ where: { id }, data });
    res.json(serialize(updated));
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: `A competitor named "${d.name}" already exists` });
    }
    throw err;
  }
});

/**
 * DELETE /api/competitors/:id — remove a competitor.
 *
 * This cascades to its archived pages, run records, and snapshots. To stop
 * monitoring without losing history, PATCH { active: false } instead. We refuse
 * a destructive delete unless ?force=true so archived data isn't dropped by
 * accident.
 */
competitorsRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

  const row = await getRowOr404(id, res);
  if (!row) return;

  const pageCount = await prisma.page.count({ where: { competitorId: id } });
  const force = req.query.force === "true";
  if (pageCount > 0 && !force) {
    return res.status(409).json({
      error:
        `"${row.name}" has ${pageCount} archived page(s). Deleting also removes that history. ` +
        `Deactivate it instead, or retry with ?force=true to delete everything.`,
      archivedPages: pageCount,
    });
  }

  await prisma.competitor.delete({ where: { id } });
  res.json({ deleted: true, id, removedPages: pageCount });
});

/** POST /api/competitors/:id/sources — add a source (sitemap/feed URL). */
competitorsRouter.post("/:id/sources", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = sourceSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const row = await getRowOr404(id, res);
  if (!row) return;

  const urls = decodeStringArray(row.sitemapUrls);
  if (urls.includes(parsed.data.url)) {
    return res.status(409).json({ error: "That source is already on this competitor" });
  }
  urls.push(parsed.data.url);
  const updated = await prisma.competitor.update({
    where: { id },
    data: { sitemapUrls: encodeJson(urls) },
  });
  res.status(201).json(serialize(updated));
});

/** DELETE /api/competitors/:id/sources — remove a source (url in body or ?url=). */
competitorsRouter.delete("/:id/sources", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

  const url = (req.body?.url ?? req.query.url) as string | undefined;
  if (!url) return res.status(400).json({ error: "A source url is required" });

  const row = await getRowOr404(id, res);
  if (!row) return;

  const urls = decodeStringArray(row.sitemapUrls);
  if (!urls.includes(url)) {
    return res.status(404).json({ error: "That source is not on this competitor" });
  }
  const updated = await prisma.competitor.update({
    where: { id },
    data: { sitemapUrls: encodeJson(urls.filter((u) => u !== url)) },
  });
  res.json(serialize(updated));
});

/**
 * POST /api/competitors/:id/ignored-subdomains — ignore a subdomain.
 * The pipeline drops any page whose host equals or is under this hostname.
 * The upcoming training page builds on this to tune what each competitor surfaces.
 */
competitorsRouter.post("/:id/ignored-subdomains", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = ignoredSubdomainSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const row = await getRowOr404(id, res);
  if (!row) return;

  const hosts = decodeStringArray(row.ignoredSubdomains);
  if (hosts.includes(parsed.data.host)) {
    return res.status(409).json({ error: "That subdomain is already ignored" });
  }
  hosts.push(parsed.data.host);
  const updated = await prisma.competitor.update({
    where: { id },
    data: { ignoredSubdomains: encodeJson(hosts) },
  });
  res.status(201).json(serialize(updated));
});

/** DELETE /api/competitors/:id/ignored-subdomains — stop ignoring a subdomain. */
competitorsRouter.delete("/:id/ignored-subdomains", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

  const raw = (req.body?.host ?? req.query.host) as string | undefined;
  if (!raw) return res.status(400).json({ error: "A host is required" });
  const target = normalizeHost(raw);

  const row = await getRowOr404(id, res);
  if (!row) return;

  const hosts = decodeStringArray(row.ignoredSubdomains);
  if (!hosts.includes(target)) {
    return res.status(404).json({ error: "That subdomain is not ignored" });
  }
  const updated = await prisma.competitor.update({
    where: { id },
    data: { ignoredSubdomains: encodeJson(hosts.filter((h) => h !== target)) },
  });
  res.json(serialize(updated));
});
