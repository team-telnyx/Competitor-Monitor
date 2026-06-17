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
    useSnapshotDiff: false,
  },
  {
    name: "Bland AI",
    sitemapUrls: ["https://www.bland.ai/sitemap.xml"],
    includePatterns: [],
    excludePatterns: ["/legal/", "/terms", "/privacy", "/careers"],
    useSnapshotDiff: false,
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
    name: "Together AI",
    sitemapUrls: ["https://www.together.ai/sitemap.xml"],
    includePatterns: [
      "together\\.ai/blog/",
      "together\\.ai/(serverless-inference|dedicated-inference|fine-tuning|batch-inference|gpu-clusters|models|pricing)",
    ],
    excludePatterns: ["/careers", "/legal", "/terms", "/privacy"],
    useSnapshotDiff: true,
  },
  {
    name: "Baseten",
    sitemapUrls: ["https://www.baseten.co/sitemap.xml"],
    includePatterns: [
      "baseten\\.co/blog/",
      "baseten\\.co/resources/changelog/",
      "baseten\\.co/(products|platform|solutions)/",
    ],
    excludePatterns: [
      "/blog/category/", "/author/",
      "/careers", "/legal", "/terms", "/privacy",
    ],
    useSnapshotDiff: true,
  },
  {
    name: "Fireworks AI",
    sitemapUrls: ["https://fireworks.ai/sitemap.xml"],
    includePatterns: [
      "fireworks\\.ai/blog/",
      "fireworks\\.ai/(platform|usecases)/",
    ],
    excludePatterns: [
      "/careers", "/team", "/events/",
      "/legal", "/terms", "/privacy",
    ],
    useSnapshotDiff: true,
  },
  {
    name: "RunPod",
    sitemapUrls: ["https://www.runpod.io/sitemap.xml"],
    includePatterns: ["runpod\\.io/blog/", "runpod\\.io/articles/"],
    excludePatterns: [
      "/blog-post-author/", "/articles/author/",
      "/careers", "/legal", "/terms", "/privacy",
    ],
    useSnapshotDiff: true,
  },
  {
    // No sitemap.xml, but the blog exposes a dated Atom feed; the pipeline's
    // parse_atom_feed() treats <updated> as lastmod, so Modal uses lastmod mode.
    name: "Modal",
    sitemapUrls: ["https://modal.com/blog/atom.xml"],
    includePatterns: [],
    excludePatterns: ["/careers", "/legal", "/terms", "/privacy"],
    useSnapshotDiff: false,
  },
  {
    // sitemap.xml is a sitemap index; the pipeline recurses into child sitemaps.
    name: "Replicate",
    sitemapUrls: ["https://replicate.com/sitemap.xml"],
    includePatterns: [
      "replicate\\.com/blog",
      "replicate\\.com/changelog",
      "replicate\\.com/docs",
    ],
    excludePatterns: ["/careers", "/legal", "/terms", "/privacy"],
    useSnapshotDiff: true,
  },
];
