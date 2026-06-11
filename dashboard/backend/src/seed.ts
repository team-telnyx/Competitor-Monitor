import { prisma, encodeJson } from "./db.js";
import { COMPETITOR_SEED } from "./competitorsConfig.js";
import { ingestRunData, type PipelineOutput } from "./ingest.js";

/** Seed competitor config from the mirrored pipeline list. */
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
    "- Deepgram announced an updated Nova transcription model with improved diarization.",
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
      competitor: "Deepgram",
      total_sitemap_urls: 860,
      checked_at: "2026-06-10T13:00:00Z",
      new_pages: [
        {
          url: "https://deepgram.com/learn/nova-3-diarization",
          source: "snapshot_diff",
          scraped: {
            title: "Nova-3: better diarization for multi-speaker audio",
            description: "Improved speaker separation and accuracy in the new Nova-3 model.",
            text_preview:
              "Nova-3 improves diarization accuracy on multi-speaker calls and reduces word error rate across noisy conditions...",
            text_length: 3100,
          },
          classification: {
            relevant: true,
            category: "STT",
            summary:
              "Deepgram released Nova-3 with improved diarization and lower WER on noisy multi-speaker audio.",
          },
        },
        {
          url: "https://deepgram.com/events/webinar-recap",
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
