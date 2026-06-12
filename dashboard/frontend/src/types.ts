export interface PageListItem {
  id: number;
  competitor: { id: number; name: string };
  url: string;
  title: string;
  summary: string | null;
  category: string | null;
  categoryColor: string;
  relevant: boolean;
  relevanceScore: number | null;
  signalType: string | null;
  product: string | null;
  detectionSource: string | null;
  lastmod: string | null;
  scrapedAt: string | null;
  firstSeenRunId: number | null;
}

export interface PageList {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: PageListItem[];
}

export interface PageDetail {
  id: number;
  competitor: { id: number; name: string };
  url: string;
  title: string;
  description: string | null;
  textPreview: string | null;
  textLength: number | null;
  detectionSource: string | null;
  lastmod: string | null;
  scrapedAt: string | null;
  classification: {
    relevant: boolean;
    relevanceScore: number | null;
    signalType: string | null;
    product: string | null;
    category: string | null;
    categoryColor: string;
    summary: string | null;
    reasoning: string | null;
    model: string | null;
    rubricVersion: string | null;
    classifiedAt: string;
  } | null;
  detectedByRunId: number | null;
  firstSeenRun: { id: number; startedAt: string; trigger: string } | null;
}

// ---- Training / feedback ----

export interface QueueItem {
  pageId: number;
  competitor: { id: number; name: string };
  url: string;
  title: string;
  product: string | null;
  category: string | null;
  categoryColor: string;
  signalType: string | null;
  relevanceScore: number | null;
  relevant: boolean;
  summary: string | null;
  reasoning: string | null;
  scrapedAt: string | null;
  reviewed: boolean;
}

export interface QueueResult {
  items: QueueItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  threshold: number;
}

export type FeedbackAction =
  | "confirm"
  | "flag_irrelevant"
  | "recategorize"
  | "reassign_product";

export const REASON_CATEGORIES = [
  "marketing",
  "customer_story",
  "careers_or_legal",
  "wrong_subdomain",
  "duplicate",
  "wrong_product",
  "wrong_category",
  "not_a_release",
  "other",
] as const;

export interface FeedbackInput {
  action: FeedbackAction;
  reasonCategory?: string;
  reason?: string;
  category?: string;
  product?: string;
  operator?: string;
}

export interface Product {
  id: number;
  competitor: { id: number; name: string | undefined };
  name: string;
  category: string | null;
  aliases: string[];
  status: "active" | "candidate" | "deprecated";
  firstSeenPageId: number | null;
}

export interface GuidanceItem {
  id: number;
  competitor: { id: number; name: string } | null;
  scope: string;
  text: string;
  active: boolean;
  createdAt: string;
}

export interface RemovalRequest {
  id: number;
  competitor: { id: number; name: string };
  kind: "subdomain" | "endpoint";
  value: string;
  host: string | null;
  status: "pending" | "approved" | "rejected";
  requestedBy: string | null;
  resolvedBy: string | null;
  pageId: number | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface CompetitorHealth {
  id: number;
  name: string;
  active: boolean;
  sitemapUrls: string[];
  includePatterns: string[];
  excludePatterns: string[];
  ignoredSubdomains: string[];
  useSnapshotDiff: boolean;
  detectionMethod: string;
  health: {
    lastChecked: string | null;
    lastNewPage: string | null;
    totalPagesArchived: number;
    consecutiveZeroRuns: number;
    possibleSilentBreak: boolean;
  };
}

/** A competitor as returned by the CRUD endpoints (no health block). */
export interface Competitor {
  id: number;
  name: string;
  active: boolean;
  sitemapUrls: string[];
  includePatterns: string[];
  excludePatterns: string[];
  ignoredSubdomains: string[];
  useSnapshotDiff: boolean;
  detectionMethod: string;
}

export interface CreateCompetitorInput {
  name: string;
  sitemapUrls?: string[];
  includePatterns?: string[];
  excludePatterns?: string[];
  ignoredSubdomains?: string[];
  useSnapshotDiff?: boolean;
  active?: boolean;
}

export type UpdateCompetitorInput = Partial<CreateCompetitorInput>;

export interface Filters {
  competitor?: string;
  category?: string;
  q?: string;
  relevant?: "true" | "false" | "all";
  from?: string;
  to?: string;
  page?: number;
}

export interface RunJob {
  id: string;
  status: "running" | "succeeded" | "failed";
  startedAt: string;
  finishedAt?: string;
  runId?: number;
  pagesIngested?: number;
  relevant?: number;
  error?: string;
  log: string[];
}

export interface StartRunRequest {
  hours?: number;
  competitor?: string;
  noSlack?: boolean;
  noClassify?: boolean;
  requireInference?: boolean;
}

export interface StartRunResponse {
  jobId: string;
  status: RunJob["status"];
}

// Canonical taxonomy — mirrors CATEGORIES in dashboard/backend/src/db.ts.
export const CATEGORIES = [
  "AI Assistants",
  "Inference",
  "STT",
  "TTS",
  "Voice",
  "Messaging",
  "Numbers",
  "Identity",
  "Fax",
  "IoT",
  "Networking",
  "Storage",
  "Other",
];

export const CATEGORY_COLORS: Record<string, string> = {
  "AI Assistants": "#8e44ad",
  Inference: "#e67e22",
  STT: "#27ae60",
  TTS: "#2980b9",
  Voice: "#16a085",
  Messaging: "#d35400",
  Numbers: "#2c3e50",
  Identity: "#c0392b",
  Fax: "#7f8c8d",
  IoT: "#f39c12",
  Networking: "#34495e",
  Storage: "#95a5a6",
  Other: "#7f8c8d",
  "Other AI/Voice": "#16a085",
};

// ---- Competitors tab ----

export interface OverviewItem {
  id: number;
  url: string;
  title: string;
  product: string | null;
  category: string | null;
  signalType: string | null;
  relevanceScore: number | null;
  scrapedAt: string | null;
}

export interface CompetitorOverview {
  id: number;
  name: string;
  productCount: number;
  products: { name: string; category: string | null }[];
  highRelevanceCount: number;
  relevantCount: number;
  recent: OverviewItem[];
}

export interface TelnyxOffering {
  id: number;
  name: string;
  category: string | null;
  description: string | null;
}

export interface OfferingComparison {
  id: number;
  competitor: { id: number; name: string };
  focusArea: string | null;
  competitorProduct: string | null;
  telnyxOffering: { id: number; name: string; category: string | null } | null;
  verdict: "parity" | "gap" | "telnyx_ahead" | "competitor_ahead" | "none";
  rationale: string | null;
  source: "inference" | "manual";
  editedBy: string | null;
}

// ---- Analytics ----

export interface ActivitySeries {
  groupBy: "day" | "week";
  series: { date: string; total: number; byCategory: Record<string, number> }[];
}
