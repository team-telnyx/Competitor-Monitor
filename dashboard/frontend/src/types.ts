export interface PageListItem {
  id: number;
  competitor: { id: number; name: string };
  url: string;
  title: string;
  summary: string | null;
  category: string | null;
  categoryColor: string;
  relevant: boolean;
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
    category: string | null;
    categoryColor: string;
    summary: string | null;
    model: string | null;
    classifiedAt: string;
  } | null;
  detectedByRunId: number | null;
  firstSeenRun: { id: number; startedAt: string; trigger: string } | null;
}

export interface CompetitorHealth {
  id: number;
  name: string;
  active: boolean;
  detectionMethod: string;
  health: {
    lastChecked: string | null;
    lastNewPage: string | null;
    totalPagesArchived: number;
    consecutiveZeroRuns: number;
    possibleSilentBreak: boolean;
  };
}

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

export const CATEGORIES = [
  "AI Assistants",
  "Inference",
  "STT",
  "TTS",
  "Other AI/Voice",
];
