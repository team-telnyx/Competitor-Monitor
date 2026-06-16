/**
 * /api/competitive — Competitive Intelligence API.
 *
 * GET / serves the cached payload (feed/companies/categories) like routes/inference.js.
 * The rest are live read/write endpoints backing the detail drawer, Training, and
 * Sources surfaces (ported from the standalone TS/Prisma backend). Mutations that change
 * what the feed shows (feedback, removal approvals) rebuild the 'competitive' cache.
 */
import { Router } from 'express';
import { readCache, writeCache } from '../cache.js';
import * as db from '../db/competitive.js';
import { runPipeline, pipelineStatus } from '../pipeline.js';

const router = Router();
const num = (v) => Number.parseInt(v, 10);
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error('[competitive] ', e.message);
  res.status(500).json({ error: e.message });
});
async function rebuildCache() {
  try { writeCache('competitive', await db.buildCompetitivePayload()); } catch (e) { console.error('[competitive] cache rebuild failed:', e.message); }
}

// ── cached payload (main tabs) ───────────────────────────────────────────────
router.get('/', (_req, res) => {
  const entry = readCache('competitive');
  if (!entry) return res.status(503).json({ error: 'Data not ready yet — refresh in progress' });
  res.json(entry.data);
});

// Rebuild the cache from the DB synchronously, so the "Refresh data" button gets
// fresh data in one round-trip (scoped + fast — unlike the global background /api/refresh).
router.post('/refresh', wrap(async (_req, res) => {
  await rebuildCache();
  res.json({ ok: true, generatedAt: readCache('competitive')?.data?.generatedAt ?? null });
}));

// Force a full pipeline (cron) run + report timing/status.
router.post('/pipeline/run', wrap(async (_req, res) => {
  const r = runPipeline();
  if (r.error) return res.status(501).json(r);
  res.status(r.alreadyRunning ? 409 : 202).json(r);
}));
router.get('/pipeline/status', wrap(async (_req, res) => res.json(pipelineStatus())));

// ── pages / signals ──────────────────────────────────────────────────────────
router.get('/pages', wrap(async (req, res) => {
  const { competitor = null, category = null, relevant = 'all', q = null } = req.query;
  const page = Math.max(1, num(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, num(req.query.pageSize) || 50));
  const items = await db.getPages({ competitor, category, relevant, q, limit: pageSize, offset: (page - 1) * pageSize });
  res.json({ items, page, pageSize });
}));

// ── runs timeline (Training graph) ───────────────────────────────────────────
router.get('/runs', wrap(async (_req, res) => res.json({ items: await db.getRuns() })));

// ── source detail (Sources expanded view) ────────────────────────────────────
router.get('/competitors/:id/sources', wrap(async (req, res) => {
  const detail = await db.getSourceDetail(num(req.params.id));
  if (!detail) return res.status(404).json({ error: 'competitor not found' });
  res.json(detail);
}));

// ── competitor detail (drawer) ───────────────────────────────────────────────
router.get('/competitors/:id/detail', wrap(async (req, res) => {
  const detail = await db.getCompetitorDetail(num(req.params.id));
  if (!detail) return res.status(404).json({ error: 'competitor not found' });
  res.json(detail);
}));

// ── competitors CRUD + sources (Sources tab) ─────────────────────────────────
router.get('/competitors', wrap(async (_req, res) => res.json({ items: await db.listCompetitorsHealth() })));
router.post('/competitors', wrap(async (req, res) => {
  if (!req.body?.name) return res.status(400).json({ error: 'name required' });
  res.status(201).json(await db.createCompetitor(req.body));
}));
router.patch('/competitors/:id', wrap(async (req, res) => res.json(await db.updateCompetitor(num(req.params.id), req.body || {}))));
router.delete('/competitors/:id', wrap(async (req, res) => {
  const r = await db.deleteCompetitor(num(req.params.id), req.query.force === 'true');
  if (r.conflict) return res.status(409).json({ error: `competitor has ${r.removedPages} archived pages; pass ?force=true to delete`, removedPages: r.removedPages });
  await rebuildCache();
  res.json(r);
}));
router.post('/competitors/:id/sources', wrap(async (req, res) => res.json(await db.addSource(num(req.params.id), req.body.url))));
router.delete('/competitors/:id/sources', wrap(async (req, res) => res.json(await db.removeSource(num(req.params.id), req.body.url || req.query.url))));
router.post('/competitors/:id/ignored-subdomains', wrap(async (req, res) => res.json(await db.addIgnoredSubdomain(num(req.params.id), req.body.host))));
router.delete('/competitors/:id/ignored-subdomains', wrap(async (req, res) => res.json(await db.removeIgnoredSubdomain(num(req.params.id), req.body.host || req.query.host))));

// ── training queue + feedback ────────────────────────────────────────────────
router.get('/queue', wrap(async (req, res) => {
  const { competitor = null, relevant = 'all' } = req.query;
  res.json(await db.getQueue({ competitor, relevant, page: num(req.query.page) || 1, pageSize: num(req.query.pageSize) || 25 }));
}));
router.post('/pages/:id/feedback', wrap(async (req, res) => {
  if (!req.body?.action) return res.status(400).json({ error: 'action required' });
  const r = await db.recordFeedback(num(req.params.id), req.body);
  if (r.error) return res.status(404).json(r);
  await rebuildCache();
  res.json(r);
}));

// ── products (candidate confirm/reject) ──────────────────────────────────────
router.get('/products', wrap(async (req, res) => {
  const competitorId = req.query.competitor ? num(req.query.competitor) : null;
  res.json({ items: await db.getProducts({ competitorId, status: req.query.status || null }) });
}));
// Track a product (e.g. from a feed item flagged "potential new product").
router.post('/products', wrap(async (req, res) => {
  if (!req.body?.competitorId || !req.body?.name) return res.status(400).json({ error: 'competitorId and name required' });
  const product = await db.createProduct(req.body);
  await rebuildCache(); // clears the potential-new-product flag now that it's tracked
  res.status(201).json(product);
}));
router.patch('/products/:id', wrap(async (req, res) => res.json(await db.updateProduct(num(req.params.id), req.body || {}))));
router.delete('/products/:id', wrap(async (req, res) => res.json(await db.deleteProduct(num(req.params.id)))));

// ── offerings + comparisons (Telnyx map) ─────────────────────────────────────
router.get('/offerings', wrap(async (_req, res) => res.json({ items: await db.getOfferings() })));
router.get('/offerings/comparisons', wrap(async (req, res) => {
  const competitorId = req.query.competitor ? num(req.query.competitor) : null;
  res.json({ items: await db.getComparisons({ competitorId }) });
}));

// ── removal requests (approval workflow) ─────────────────────────────────────
router.get('/removal-requests', wrap(async (req, res) => res.json({ items: await db.listRemovalRequests(req.query.status || 'pending') })));
router.post('/removal-requests', wrap(async (req, res) => {
  if (!req.body?.competitorId || !req.body?.value) return res.status(400).json({ error: 'competitorId and value required' });
  res.status(201).json(await db.createRemovalRequest(req.body));
}));
router.post('/removal-requests/:id/approve', wrap(async (req, res) => {
  const r = await db.resolveRemoval(num(req.params.id), 'approve', req.body?.resolvedBy || null);
  if (r.error) return res.status(404).json(r);
  await rebuildCache();
  res.json(r);
}));
router.post('/removal-requests/:id/reject', wrap(async (req, res) => {
  const r = await db.resolveRemoval(num(req.params.id), 'reject', req.body?.resolvedBy || null);
  if (r.error) return res.status(404).json(r);
  res.json(r);
}));

// ── guidance ─────────────────────────────────────────────────────────────────
router.get('/guidance', wrap(async (_req, res) => res.json({ items: await db.listGuidance() })));
router.post('/guidance', wrap(async (req, res) => {
  if (!req.body?.text) return res.status(400).json({ error: 'text required' });
  res.status(201).json(await db.createGuidance(req.body));
}));
router.patch('/guidance/:id', wrap(async (req, res) => res.json(await db.updateGuidance(num(req.params.id), req.body || {}))));
router.delete('/guidance/:id', wrap(async (req, res) => res.json(await db.deleteGuidance(num(req.params.id)))));

export default router;
