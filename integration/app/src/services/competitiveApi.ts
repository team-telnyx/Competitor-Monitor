/**
 * Competitive Intelligence API client.
 * Raw fetch (same pattern as services/inferenceApi.ts) against the Express backend.
 * NOTE: bigint ids arrive as strings from Postgres — treat ids as opaque (keys/URLs).
 */

// ── Types ──────────────────────────────────────────────────────────────────
export interface FeedItem {
  id: number; competitorId: number; competitor: string; category: string | null; signalType: string | null;
  relevanceScore: number | null; relevant: boolean; title: string | null;
  summary: string | null; url: string; date: string | null; categoryColor?: string;
  product: string | null;
  potentialNewProduct?: boolean;
  potentialNewFeature?: boolean; // captured; intentionally not surfaced in the UI yet
}
export interface Company {
  id: number; name: string; totalPages: number; relevantCount: number; launches: number;
  lastActivity: string | null; categories: string[];
}
export interface Category {
  category: string; total: number; relevantCount: number; competitorCount: number;
  competitors: string[]; categoryColor?: string;
}
export interface CompetitivePayload {
  feed: FeedItem[]; companies: Company[]; categories: Category[]; generatedAt: string;
}
export interface Signal {
  id: number; competitorId: number; competitor: string; url: string; title: string | null;
  summary: string | null; category: string | null; categoryColor: string; relevant: boolean;
  relevanceScore: number | null; signalType: string | null; product: string | null;
  reasoning: string | null; scrapedAt: string | null;
}
export interface Product { id: number; competitorId: number; name: string; category: string | null; aliases: string[]; status: string; }
export interface Offering { id: number; name: string; category: string | null; description: string | null; }
export interface Comparison {
  id: number; focusArea: string | null; competitorProduct: string | null; verdict: string;
  rationale: string | null; source: string; telnyxOfferingId: number | null; telnyxOfferingName: string | null;
}
export interface CompetitorDetail {
  competitor: { id: number; name: string; active: boolean };
  signals: Signal[]; products: Product[]; offerings: Offering[]; comparisons: Comparison[];
  categoryColors: Record<string, string>;
}
export interface QueueItem {
  pageId: number; competitorId: number; competitor: string; url: string; title: string | null;
  product: string | null; category: string | null; categoryColor: string; signalType: string | null;
  relevanceScore: number | null; relevant: boolean; summary: string | null; reasoning: string | null;
  scrapedAt: string | null; reviewed: boolean;
}
export interface QueueResult { items: QueueItem[]; total: number; page: number; pageSize: number; totalPages: number; threshold: number; }
export interface CompetitorHealth {
  id: number; name: string; active: boolean; sitemapUrls: string[]; includePatterns: string[];
  excludePatterns: string[]; ignoredSubdomains: string[]; useSnapshotDiff: boolean;
  detectionMethod: string; lastChecked: string | null; lastNewPage: string | null; totalPagesArchived: number;
  scrapedOk: number; scrapeFailed: number; snapshotAt: string | null; snapshotUrls: number | null;
}
export interface RemovalRequest {
  id: number; competitorId: number; competitor: string; kind: string; value: string; host: string | null;
  status: string; requestedBy: string | null; resolvedBy: string | null; createdAt: string;
}
export interface GuidanceItem { id: number; competitorId: number | null; scope: string; text: string; active: boolean; createdAt: string; }

export const CATEGORY_COLORS: Record<string, string> = {
  'AI Assistants': '#8e44ad', Inference: '#e67e22', STT: '#27ae60', TTS: '#2980b9',
  Voice: '#16a085', Messaging: '#d35400', Numbers: '#2c3e50', Identity: '#c0392b',
  Fax: '#7f8c8d', IoT: '#f39c12', Networking: '#34495e', Storage: '#95a5a6', Other: '#7f8c8d',
};

// ── fetch helpers ────────────────────────────────────────────────────────────
const BASE = '/api/competitive';
async function getJSON<T>(path: string, fallback: T): Promise<T> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    const res = await fetch(BASE + path, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch {
    console.warn(`[api] ${BASE}${path} unreachable`);
    return fallback;
  }
}
async function send(path: string, method: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── reads ──────────────────────────────────────────────────────────────────
export const getCompetitive = () => getJSON<CompetitivePayload | null>('', null);
export const getCompetitorDetail = (id: number | string) => getJSON<CompetitorDetail | null>(`/competitors/${id}/detail`, null);
export const getCompetitors = () => getJSON<{ items: CompetitorHealth[] }>('/competitors', { items: [] }).then((r) => r.items);
export const getQueue = (p: { competitor?: string; relevant?: string; page?: number; pageSize?: number } = {}) => {
  const qs = new URLSearchParams();
  if (p.competitor && p.competitor !== 'all') qs.set('competitor', p.competitor);
  if (p.relevant) qs.set('relevant', p.relevant);
  if (p.page) qs.set('page', String(p.page));
  if (p.pageSize) qs.set('pageSize', String(p.pageSize));
  return getJSON<QueueResult>(`/queue?${qs}`, { items: [], total: 0, page: 1, pageSize: 25, totalPages: 1, threshold: 40 });
};
export const getRemovalRequests = (status = 'pending') => getJSON<{ items: RemovalRequest[] }>(`/removal-requests?status=${status}`, { items: [] }).then((r) => r.items);
export const getGuidance = () => getJSON<{ items: GuidanceItem[] }>('/guidance', { items: [] }).then((r) => r.items);
export const getCandidateProducts = () => getJSON<{ items: Product[] }>('/products?status=candidate', { items: [] }).then((r) => r.items);

// ── writes ───────────────────────────────────────────────────────────────────
export const postFeedback = (pageId: number | string, body: Record<string, unknown>) => send(`/pages/${pageId}/feedback`, 'POST', body);
export const addSource = (id: number | string, url: string) => send(`/competitors/${id}/sources`, 'POST', { url });
export const removeSource = (id: number | string, url: string) => send(`/competitors/${id}/sources`, 'DELETE', { url });
export const addIgnoredSubdomain = (id: number | string, host: string) => send(`/competitors/${id}/ignored-subdomains`, 'POST', { host });
export const removeIgnoredSubdomain = (id: number | string, host: string) => send(`/competitors/${id}/ignored-subdomains`, 'DELETE', { host });
export const createCompetitor = (body: Record<string, unknown>) => send('/competitors', 'POST', body);
export const updateCompetitor = (id: number | string, body: Record<string, unknown>) => send(`/competitors/${id}`, 'PATCH', body);
export const addProduct = (body: { competitorId: number | string; name: string; category?: string | null }) => send('/products', 'POST', body);
export const deleteCompetitor = (id: number | string, force = false) => send(`/competitors/${id}?force=${force}`, 'DELETE');
export const createRemovalRequest = (body: Record<string, unknown>) => send('/removal-requests', 'POST', body);
export const approveRemoval = (id: number | string, resolvedBy?: string) => send(`/removal-requests/${id}/approve`, 'POST', { resolvedBy });
export const rejectRemoval = (id: number | string, resolvedBy?: string) => send(`/removal-requests/${id}/reject`, 'POST', { resolvedBy });
export const createGuidance = (body: Record<string, unknown>) => send('/guidance', 'POST', body);
export const deleteGuidance = (id: number | string) => send(`/guidance/${id}`, 'DELETE');
export const confirmProduct = (id: number | string, category?: string) => send(`/products/${id}`, 'PATCH', { status: 'active', category });
export const rejectProduct = (id: number | string) => send(`/products/${id}`, 'DELETE');

// Rebuild the competitive cache from the DB (awaitable), then callers re-fetch.
export interface Run { id: number; startedAt: string; finishedAt: string | null; status: string; trigger: string; pages: number; relevant: number; competitors: number; durationMs: number | null; }
export const getRuns = () => getJSON<{ items: Run[] }>('/runs', { items: [] }).then((r) => r.items);

export interface EndpointNode { seg?: string; base?: string; path: string; total: number; considered: number; childCount?: number; children?: EndpointNode[]; }
export interface SourceInventory { source: string; totalUrls: number; savedAt: string; bases: EndpointNode[]; totalBases: number; otherBases: number; otherUrls: number; consideredUrls: number; }
export interface SourceScrape { total: number; scraped: number; errored: number; empty: number; failures: { url: string; reason: string }[]; }
export interface SourceDetail {
  competitor: { id: number; name: string; sitemapUrls: string[]; includePatterns: string[]; excludePatterns: string[]; ignoredSubdomains: string[] };
  inventory: SourceInventory | null;
  totalSitemapUrls: number | null;
  scrape: SourceScrape;
  pendingRemovals: { id: number; value: string }[];
}
export const getSourceDetail = (id: number | string) => getJSON<SourceDetail | null>(`/competitors/${id}/sources`, null);

export async function triggerRefresh(): Promise<void> {
  try { await fetch(`${BASE}/refresh`, { method: 'POST' }); } catch { /* ignore */ }
}

export interface PipelineStatus {
  running: boolean;
  startedAt: string | null;
  elapsedMs: number | null;
  last: { lastStartedAt: string; lastFinishedAt: string; durationMs: number; status: string; exitCode: number } | null;
}
export const getPipelineStatus = () =>
  getJSON<PipelineStatus>('/pipeline/status', { running: false, startedAt: null, elapsedMs: null, last: null });
// Kick off a full pipeline (cron) run. 202 started, 409 already running, 501 not configured.
export async function runPipeline(): Promise<{ ok: boolean; status: number }> {
  try { const r = await fetch(`${BASE}/pipeline/run`, { method: 'POST' }); return { ok: r.ok, status: r.status }; }
  catch { return { ok: false, status: 0 }; }
}
