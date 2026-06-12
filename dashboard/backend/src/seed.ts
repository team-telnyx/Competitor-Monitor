import { prisma, encodeJson } from "./db.js";
import { COMPETITOR_SEED } from "./competitorsConfig.js";
import { PRODUCT_CATALOG } from "./productCatalog.js";
import { TELNYX_OFFERINGS } from "./telnyxOfferings.js";
import { ingestRunData, type PipelineOutput } from "./ingest.js";

/** Seed competitor config from the mirrored pipeline list, then prune anything
 *  not in the list so the DB converges on exactly COMPETITOR_SEED. The prune is
 *  a hard delete and cascades to the competitor's archived pages/runs/snapshots
 *  (schema onDelete: Cascade) — set KEEP_EXTRA_COMPETITORS=1 to skip it. */
async function seedCompetitors() {
  for (const c of COMPETITOR_SEED) {
    const fields = {
      sitemapUrls: encodeJson(c.sitemapUrls),
      includePatterns: encodeJson(c.includePatterns),
      excludePatterns: encodeJson(c.excludePatterns),
      useSnapshotDiff: c.useSnapshotDiff,
    };
    await prisma.competitor.upsert({
      where: { name: c.name },
      update: fields,
      create: { name: c.name, ...fields },
    });
  }
  console.log(`Seeded ${COMPETITOR_SEED.length} competitors.`);

  if (process.env.KEEP_EXTRA_COMPETITORS === "1") {
    console.log("Skipping prune (KEEP_EXTRA_COMPETITORS=1).");
    return;
  }

  const keep = new Set(COMPETITOR_SEED.map((c) => c.name));
  const extras = await prisma.competitor.findMany({
    where: { name: { notIn: [...keep] } },
    select: { id: true, name: true, _count: { select: { pages: true } } },
  });
  for (const e of extras) {
    await prisma.competitor.delete({ where: { id: e.id } });
    console.log(`Pruned competitor "${e.name}" (purged ${e._count.pages} archived page(s)).`);
  }
  if (extras.length) console.log(`Pruned ${extras.length} competitor(s) not in the seed list.`);
}

/** Seed the draft product registry. Upserts known products; never demotes an
 *  operator-confirmed one (status is only set on create). */
async function seedProducts() {
  let count = 0;
  for (const [competitorName, products] of Object.entries(PRODUCT_CATALOG)) {
    const competitor = await prisma.competitor.findUnique({
      where: { name: competitorName },
      select: { id: true },
    });
    if (!competitor) continue;
    for (const p of products) {
      await prisma.product.upsert({
        where: { competitorId_name: { competitorId: competitor.id, name: p.name } },
        update: { category: p.category, aliases: encodeJson(p.aliases ?? []) },
        create: {
          competitorId: competitor.id,
          name: p.name,
          category: p.category,
          aliases: encodeJson(p.aliases ?? []),
          status: "active",
        },
      });
      count++;
    }
  }
  console.log(
    `Seeded ${count} products across ${Object.keys(PRODUCT_CATALOG).length} competitors.`,
  );
}

/** Seed the Telnyx offerings catalog (idempotent upsert by name). */
async function seedTelnyxOfferings() {
  for (const o of TELNYX_OFFERINGS) {
    await prisma.telnyxOffering.upsert({
      where: { name: o.name },
      update: { category: o.category },
      create: { name: o.name, category: o.category },
    });
  }
  console.log(`Seeded ${TELNYX_OFFERINGS.length} Telnyx offerings.`);
}

/**
 * Synthetic demo run so the archive/feed has something to render before the
 * first real pipeline run. Shaped exactly like tools/competitor_monitor.py
 * output so it exercises the real ingest path. Enabled with `--demo`.
 */
const DEMO_RUN: PipelineOutput = {
  scan_time: "2026-06-10T13:00:00Z",
  hours: 24,
  digest: [
    "**TTS**",
    "- ElevenLabs shipped a lower-latency streaming voice model targeting real-time agents.",
    "",
    "**STT**",
    "- AssemblyAI announced an updated Universal transcription model with improved diarization.",
    "",
    "**Key Takeaways**",
    "- Real-time voice latency is the active battleground this week.",
  ].join("\n"),
  results: [
    {
      competitor: "ElevenLabs",
      total_sitemap_urls: 1240,
      checked_at: "2026-06-10T13:00:00Z",
      new_pages: [
        {
          url: "https://elevenlabs.io/blog/streaming-v3",
          lastmod: "2026-06-10",
          lastmod_parsed: "2026-06-10T09:30:00Z",
          source: "lastmod",
          scraped: {
            title: "Introducing Streaming v3 — sub-200ms TTS",
            description: "A new low-latency streaming voice model for real-time agents.",
            text_preview:
              "Today we are launching Streaming v3, our lowest-latency text-to-speech model yet, designed for conversational voice agents that need sub-200ms time-to-first-audio...",
            text_length: 4200,
          },
          classification: {
            relevant: true,
            category: "TTS",
            summary:
              "ElevenLabs launched Streaming v3, a sub-200ms TTS model aimed at real-time voice agents.",
          },
        },
      ],
    },
    {
      competitor: "AssemblyAI",
      total_sitemap_urls: 860,
      checked_at: "2026-06-10T13:00:00Z",
      new_pages: [
        {
          url: "https://www.assemblyai.com/blog/universal-2-diarization",
          source: "snapshot_diff",
          scraped: {
            title: "Universal-2: better diarization for multi-speaker audio",
            description: "Improved speaker separation and accuracy in the new Universal-2 model.",
            text_preview:
              "Universal-2 improves diarization accuracy on multi-speaker calls and reduces word error rate across noisy conditions...",
            text_length: 3100,
          },
          classification: {
            relevant: true,
            category: "STT",
            summary:
              "AssemblyAI released Universal-2 with improved diarization and lower WER on noisy multi-speaker audio.",
          },
        },
        {
          url: "https://www.assemblyai.com/events/webinar-recap",
          source: "snapshot_diff",
          scraped: {
            title: "Webinar recap: building with voice AI",
            description: "A recap of our recent community webinar.",
            text_preview: "Thanks to everyone who joined our webinar on building voice AI products...",
            text_length: 900,
          },
          classification: {
            relevant: false,
            category: "Not Relevant",
            summary: "Community webinar recap, no product news.",
          },
        },
      ],
    },
  ],
};

async function main() {
  const demo = process.argv.includes("--demo");
  await seedCompetitors();
  await seedProducts();
  await seedTelnyxOfferings();
  if (demo) {
    const r = await ingestRunData(DEMO_RUN, { trigger: "scheduled", slackStatus: "sent" });
    console.log(
      `Seeded demo run #${r.runId}: ${r.pages} pages (${r.relevant} relevant).`,
    );
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
