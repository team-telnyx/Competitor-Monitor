import fs from "node:fs/promises";
import { prisma } from "./db.js";

/**
 * Shapes produced by tools/competitor_monitor.py (run_monitor -> output_data).
 * Kept loose on purpose; the pipeline is the source of truth and may add fields.
 */
interface PipelineClassification {
  relevant?: boolean;
  category?: string;
  summary?: string;
}
interface PipelineScraped {
  title?: string;
  description?: string;
  text_preview?: string;
  text_length?: number;
  error?: string;
}
interface PipelinePage {
  url: string;
  lastmod?: string | null;
  lastmod_parsed?: string | null;
  source?: string;
  scraped?: PipelineScraped;
  classification?: PipelineClassification;
}
interface PipelineResult {
  competitor: string;
  total_sitemap_urls?: number;
  new_pages?: PipelinePage[];
  checked_at?: string;
}
export interface PipelineOutput {
  results: PipelineResult[];
  digest?: string | null;
  inference?: {
    provider?: string;
    model?: string;
  } | null;
  scan_time?: string;
  hours?: number;
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function detectionSourceFor(page: PipelinePage): string | null {
  if (page.source) return page.source;
  if (page.lastmod || page.lastmod_parsed) return "lastmod";
  return null;
}

export interface IngestOptions {
  trigger?: "scheduled" | "manual";
  slackStatus?: string | null;
  emailStatus?: string | null;
  errorSummary?: string | null;
}

/** Ingest a parsed pipeline payload into the DB. Returns the created run id. */
export async function ingestRunData(
  data: PipelineOutput,
  opts: IngestOptions = {},
): Promise<{ runId: number; pages: number; relevant: number }> {
  const scanTime = parseDate(data.scan_time) ?? new Date();
  const results = data.results ?? [];
  const model = [data.inference?.provider, data.inference?.model]
    .filter(Boolean)
    .join(":") || "unknown";

  let totalPages = 0;
  let totalRelevant = 0;
  let anyError = false;

  const run = await prisma.run.create({
    data: {
      startedAt: scanTime,
      finishedAt: scanTime,
      hoursWindow: data.hours ?? 24,
      status: "running",
      trigger: opts.trigger ?? "scheduled",
      digestText: data.digest ?? null,
      slackStatus: opts.slackStatus ?? null,
      emailStatus: opts.emailStatus ?? null,
      errorSummary: opts.errorSummary ?? null,
    },
  });

  for (const result of results) {
    const pages = result.new_pages ?? [];
    const relevantCount = pages.filter(
      (p) => p.classification?.relevant === true,
    ).length;
    totalPages += pages.length;
    totalRelevant += relevantCount;

    // Competitors are normally seeded; upsert by name so ingest never fails
    // if the pipeline reports one we don't have yet.
    const competitor = await prisma.competitor.upsert({
      where: { name: result.competitor },
      update: {},
      create: {
        name: result.competitor,
        sitemapUrls: "[]",
        includePatterns: "[]",
        excludePatterns: "[]",
      },
    });

    const compHadError = pages.some((p) => p.scraped?.error);
    if (compHadError) anyError = true;

    const runCompetitor = await prisma.runCompetitor.create({
      data: {
        runId: run.id,
        competitorId: competitor.id,
        totalSitemapUrls: result.total_sitemap_urls ?? 0,
        newPageCount: pages.length,
        relevantCount,
        checkedAt: parseDate(result.checked_at),
        status: compHadError ? "partial" : "success",
      },
    });

    for (const page of pages) {
      const scraped = page.scraped ?? {};
      const cls = page.classification ?? {};
      const lastmod = parseDate(page.lastmod_parsed ?? page.lastmod ?? null);

      // Dedupe by (competitor, url): a re-detected URL updates content but
      // keeps its original first-seen run so the archive shows one item.
      const existing = await prisma.page.findUnique({
        where: { competitorId_url: { competitorId: competitor.id, url: page.url } },
        select: { id: true },
      });

      const pageRow = await prisma.page.upsert({
        where: { competitorId_url: { competitorId: competitor.id, url: page.url } },
        create: {
          runCompetitorId: runCompetitor.id,
          competitorId: competitor.id,
          url: page.url,
          lastmod,
          detectionSource: detectionSourceFor(page),
          title: scraped.title ?? null,
          description: scraped.description ?? null,
          textPreview: scraped.text_preview ?? null,
          textLength: scraped.text_length ?? null,
          firstSeenRunId: run.id,
          scrapedAt: scanTime,
        },
        update: {
          // refresh latest scraped content; preserve first-seen linkage
          title: scraped.title ?? undefined,
          description: scraped.description ?? undefined,
          textPreview: scraped.text_preview ?? undefined,
          textLength: scraped.text_length ?? undefined,
          lastmod: lastmod ?? undefined,
          scrapedAt: scanTime,
        },
      });

      await prisma.classification.upsert({
        where: { pageId: pageRow.id },
        create: {
          pageId: pageRow.id,
          relevant: cls.relevant ?? false,
          category: cls.category ?? null,
          summary: cls.summary ?? null,
          model,
        },
        update: {
          relevant: cls.relevant ?? false,
          category: cls.category ?? null,
          summary: cls.summary ?? null,
          model,
        },
      });

      // Mark whether this was genuinely new this run (for logging/debug only).
      void existing;
    }
  }

  const status = anyError ? "partial" : "success";
  await prisma.run.update({
    where: { id: run.id },
    data: { status },
  });

  return { runId: run.id, pages: totalPages, relevant: totalRelevant };
}

/** Read a pipeline JSON artifact from disk and ingest it. */
export async function ingestRunFile(
  filePath: string,
  opts: IngestOptions = {},
): Promise<{ runId: number; pages: number; relevant: number }> {
  const raw = await fs.readFile(filePath, "utf8");
  const data = JSON.parse(raw) as PipelineOutput;
  return ingestRunData(data, opts);
}
