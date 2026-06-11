// Mirrors the COMPETITORS list in tools/competitor_monitor.py so the dashboard
// can seed its config table. In Phase 2 the dashboard becomes the source of
// truth (competitor CRUD) and the pipeline reads from the DB instead.
export interface CompetitorSeed {
  name: string;
  sitemapUrls: string[];
  includePatterns: string[];
  excludePatterns: string[];
  useSnapshotDiff: boolean;
}

export const COMPETITOR_SEED: CompetitorSeed[] = [
  {
    name: "Vapi",
    sitemapUrls: ["https://vapi.ai/sitemap.xml"],
    includePatterns: [],
    excludePatterns: ["/legal/", "/terms", "/privacy", "/careers"],
    useSnapshotDiff: true,
  },
  {
    name: "ElevenLabs",
    sitemapUrls: ["https://elevenlabs.io/sitemap.xml"],
    includePatterns: [
      "elevenlabs\\.io/blog",
      "elevenlabs\\.io/docs/changelog",
      "elevenlabs\\.io/docs/api-reference",
      "elevenlabs\\.io/[^/]+$",
    ],
    excludePatterns: [
      "/careers/", "/legal/", "/terms", "/privacy",
      "/languages/", "/community/", "/voice-library/",
    ],
    useSnapshotDiff: false,
  },
  {
    name: "Retell AI",
    sitemapUrls: ["https://www.retellai.com/sitemap.xml"],
    includePatterns: ["/blog/", "/changelog", "/docs/", "retellai\\.com/[^/]+$"],
    excludePatterns: ["/legal/", "/terms", "/privacy", "/careers"],
    useSnapshotDiff: true,
  },
  {
    name: "Bland AI",
    sitemapUrls: ["https://www.bland.ai/sitemap.xml"],
    includePatterns: [],
    excludePatterns: ["/legal/", "/terms", "/privacy", "/careers"],
    useSnapshotDiff: false,
  },
  {
    name: "Deepgram",
    sitemapUrls: ["https://deepgram.com/sitemap.xml"],
    includePatterns: ["/blog/", "/changelog", "/learn/", "deepgram\\.com/[^/]+$"],
    excludePatterns: [
      "/careers/", "/legal/", "/terms", "/privacy", "/partners/", "/events/",
    ],
    useSnapshotDiff: true,
  },
  {
    name: "AssemblyAI",
    sitemapUrls: ["https://www.assemblyai.com/sitemap.xml"],
    includePatterns: ["/blog/", "/changelog", "/docs/", "assemblyai\\.com/[^/]+$"],
    excludePatterns: ["/careers/", "/legal/", "/terms", "/privacy"],
    useSnapshotDiff: true,
  },
  {
    name: "Twilio",
    sitemapUrls: ["https://www.twilio.com/sitemap.xml"],
    includePatterns: [
      "twilio\\.com/en-us/blog/",
      "twilio\\.com/en-us/changelog",
      "twilio\\.com/en-us/press/",
    ],
    excludePatterns: [],
    useSnapshotDiff: false,
  },
  {
    name: "OpenAI",
    sitemapUrls: ["https://openai.com/sitemap.xml"],
    includePatterns: ["openai\\.com/index/", "openai\\.com/api/"],
    excludePatterns: ["/careers/", "/legal/", "/terms", "/privacy"],
    useSnapshotDiff: false,
  },
  {
    name: "Google Cloud Speech",
    sitemapUrls: ["https://cloud.google.com/sitemap.xml"],
    includePatterns: [
      "/speech-to-text/", "/text-to-speech/",
      "/vertex-ai/.*release", "/vertex-ai/.*changelog",
      "/blog/products/ai-machine-learning",
    ],
    excludePatterns: [],
    useSnapshotDiff: false,
  },
];
