import type {
  ActivitySeries,
  Competitor,
  CompetitorHealth,
  CompetitorOverview,
  CreateCompetitorInput,
  FeedbackInput,
  Filters,
  GuidanceItem,
  OfferingComparison,
  PageDetail,
  PageList,
  Product,
  QueueResult,
  RunJob,
  StartRunRequest,
  StartRunResponse,
  RemovalRequest,
  TelnyxOffering,
  UpdateCompetitorInput,
} from "./types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    const message = errorBody?.error?.formErrors?.join("; ") ||
      errorBody?.error ||
      `${res.status} ${res.statusText}`;
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

async function sendJson<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await extractError(res));
  }
  return res.json() as Promise<T>;
}

/** Pull a human-readable message out of an error response (zod or plain). */
async function extractError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  const err = body?.error;
  if (typeof err === "string") return err;
  if (err?.formErrors?.length) return err.formErrors.join("; ");
  if (err?.fieldErrors) {
    const parts = Object.entries(err.fieldErrors).map(
      ([k, v]) => `${k}: ${(v as string[]).join(", ")}`,
    );
    if (parts.length) return parts.join("; ");
  }
  return `${res.status} ${res.statusText}`;
}

export function buildPagesQuery(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.competitor) params.set("competitor", filters.competitor);
  if (filters.category) params.set("category", filters.category);
  if (filters.q) params.set("q", filters.q);
  if (filters.relevant) params.set("relevant", filters.relevant);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.page) params.set("page", String(filters.page));
  const qs = params.toString();
  return `/api/pages${qs ? `?${qs}` : ""}`;
}

export const api = {
  pages: (filters: Filters) => getJson<PageList>(buildPagesQuery(filters)),
  page: (id: number) => getJson<PageDetail>(`/api/pages/${id}`),
  competitors: () =>
    getJson<{ items: CompetitorHealth[] }>("/api/competitors"),
  startRun: (body: StartRunRequest) =>
    postJson<StartRunResponse>("/api/runs", body),
  runJob: (id: string) => getJson<RunJob>(`/api/runs/jobs/${id}`),

  createCompetitor: (body: CreateCompetitorInput) =>
    sendJson<Competitor>("POST", "/api/competitors", body),
  updateCompetitor: (id: number, body: UpdateCompetitorInput) =>
    sendJson<Competitor>("PATCH", `/api/competitors/${id}`, body),
  deleteCompetitor: (id: number, force = false) =>
    sendJson<{ deleted: boolean }>(
      "DELETE",
      `/api/competitors/${id}${force ? "?force=true" : ""}`,
    ),
  addSource: (id: number, url: string) =>
    sendJson<Competitor>("POST", `/api/competitors/${id}/sources`, { url }),
  removeSource: (id: number, url: string) =>
    sendJson<Competitor>("DELETE", `/api/competitors/${id}/sources`, { url }),
  addIgnoredSubdomain: (id: number, host: string) =>
    sendJson<Competitor>("POST", `/api/competitors/${id}/ignored-subdomains`, { host }),
  removeIgnoredSubdomain: (id: number, host: string) =>
    sendJson<Competitor>("DELETE", `/api/competitors/${id}/ignored-subdomains`, { host }),

  // Training / feedback — mirrors the feed (paginated), not a low-confidence subset
  queue: (params: { competitor?: string; page?: number; relevant?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.competitor) qs.set("competitor", params.competitor);
    if (params.page) qs.set("page", String(params.page));
    if (params.relevant) qs.set("relevant", params.relevant);
    const s = qs.toString();
    return getJson<QueueResult>(`/api/feedback/queue${s ? `?${s}` : ""}`);
  },
  submitFeedback: (pageId: number, body: FeedbackInput) =>
    sendJson<{ ok: boolean; feedbackId: number }>(
      "POST",
      `/api/pages/${pageId}/feedback`,
      body,
    ),
  products: (params: { status?: string; competitor?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.competitor) qs.set("competitor", params.competitor);
    const s = qs.toString();
    return getJson<{ items: Product[] }>(`/api/products${s ? `?${s}` : ""}`);
  },
  updateProduct: (id: number, body: Partial<Pick<Product, "name" | "category" | "aliases" | "status">>) =>
    sendJson<Product>("PATCH", `/api/products/${id}`, body),
  deleteProduct: (id: number) =>
    sendJson<{ deleted: boolean }>("DELETE", `/api/products/${id}`),

  // Guidance (plain-text notes fed to inference)
  guidance: (competitor?: string) =>
    getJson<{ items: GuidanceItem[] }>(
      `/api/guidance${competitor ? `?competitor=${encodeURIComponent(competitor)}` : ""}`,
    ),
  addGuidance: (body: { text: string; competitorId?: number | null }) =>
    sendJson<{ id: number }>("POST", "/api/guidance", body),
  toggleGuidance: (id: number, active: boolean) =>
    sendJson<{ id: number; active: boolean }>("PATCH", `/api/guidance/${id}`, { active }),
  deleteGuidance: (id: number) =>
    sendJson<{ deleted: boolean }>("DELETE", `/api/guidance/${id}`),

  // Removal requests (approval workflow): kind "subdomain" or "endpoint"
  requestRemoval: (
    competitorId: number,
    kind: "subdomain" | "endpoint",
    value: string,
    pageId?: number,
  ) =>
    sendJson<RemovalRequest>("POST", "/api/removal-requests", {
      competitorId,
      kind,
      value,
      pageId,
    }),
  removalRequests: (status?: string) =>
    getJson<{ items: RemovalRequest[] }>(
      `/api/removal-requests${status ? `?status=${status}` : ""}`,
    ),
  approveRemoval: (id: number) =>
    sendJson<{ ok: boolean; host: string }>("POST", `/api/removal-requests/${id}/approve`, {}),
  rejectRemoval: (id: number) =>
    sendJson<{ ok: boolean }>("POST", `/api/removal-requests/${id}/reject`, {}),

  regeneratePolicy: () => sendJson<{ ok: boolean; path: string }>("POST", "/api/policy/regenerate", {}),

  // Competitors tab
  competitorsOverview: (minScore = 70) =>
    getJson<{ minScore: number; items: CompetitorOverview[] }>(
      `/api/competitors/overview?minScore=${minScore}`,
    ),
  activity: (params: { from?: string; to?: string; groupBy?: "day" | "week" } = {}) => {
    const qs = new URLSearchParams();
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    if (params.groupBy) qs.set("groupBy", params.groupBy);
    const s = qs.toString();
    return getJson<ActivitySeries>(`/api/analytics/activity${s ? `?${s}` : ""}`);
  },

  // Telnyx offering map
  offerings: () => getJson<{ items: TelnyxOffering[] }>("/api/offerings"),
  addOffering: (body: { name: string; category?: string; description?: string }) =>
    sendJson<TelnyxOffering>("POST", "/api/offerings", body),
  deleteOffering: (id: number) =>
    sendJson<{ deleted: boolean }>("DELETE", `/api/offerings/${id}`),
  comparisons: (competitor?: string) =>
    getJson<{ items: OfferingComparison[] }>(
      `/api/offerings/comparisons${competitor ? `?competitor=${encodeURIComponent(competitor)}` : ""}`,
    ),
  updateComparison: (id: number, body: Partial<{ verdict: string; rationale: string; competitorProduct: string }>) =>
    sendJson<OfferingComparison>("PATCH", `/api/offerings/comparisons/${id}`, body),
};
