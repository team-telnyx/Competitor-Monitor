/**
 * Competitive Intelligence — Postgres data layer (plg-dashboard `server/db/competitive.js`).
 *
 * Plain-JS ESM, standard `pg` driver (reached via DATABASE_URL — same code runs against
 * the local test Postgres and pgbot-main-18's competitor_intel). Ported from the
 * standalone TS/Prisma backend (dashboard/backend/src/routes/*). jsonb array columns
 * come back as JS arrays from pg, so no manual JSON decode is needed.
 *
 * The pipeline (pipeline/write_db.py) writes; this reads + applies operator writes
 * (feedback / sources / removal approvals / guidance). The DB schema is the contract.
 */
import pg from 'pg';

const { Pool } = pg;

let pool;
export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 6,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 15_000,
    });
  }
  return pool;
}
const q = (text, params) => getPool().query(text, params);

export const RELEVANCE_THRESHOLD = 40;
export const NON_SIGNAL_CATEGORIES = ['Not Relevant'];

export const CATEGORY_COLORS = {
  'AI Assistants': '#8e44ad', Inference: '#e67e22', STT: '#27ae60', TTS: '#2980b9',
  Voice: '#16a085', Messaging: '#d35400', Numbers: '#2c3e50', Identity: '#c0392b',
  Fax: '#7f8c8d', IoT: '#f39c12', Networking: '#34495e', Storage: '#95a5a6',
  Other: '#7f8c8d', 'Other AI/Voice': '#16a085', 'Not Relevant': '#7f8c8d',
};
const colorFor = (c) => CATEGORY_COLORS[c] ?? '#7f8c8d';

// Canonical product taxonomy — the Categories tab shows ALL of these (zero-filled when a
// category has no signal yet), so it reads as a coverage map of the whole product space,
// not just whatever this run happened to classify.
export const CATEGORIES = ['AI Assistants', 'Inference', 'STT', 'TTS', 'Voice', 'Messaging', 'Numbers', 'Identity', 'Fax', 'IoT', 'Networking', 'Storage', 'Other'];

// ── Feed / Companies / Categories (the cached payload) ───────────────────────

export async function getFeed(opts = {}) {
  const { competitor = null, category = null, relevantOnly = false, limit = 500, offset = 0 } = opts;
  const { rows } = await q(
    `SELECT p.id, c.id AS "competitorId", c.name AS competitor, cl.category, cl.signal_type AS "signalType",
            cl.relevance_score AS "relevanceScore", cl.relevant, p.title, cl.summary, p.url, cl.product,
            COALESCE(p.lastmod, p.scraped_at) AS date,
            -- a new-product signal for something not already in our tracked catalog → flag for consideration
            (cl.signal_type = 'new_product' AND NOT EXISTS (
               SELECT 1 FROM products pr WHERE pr.competitor_id = p.competitor_id AND pr.status='active'
                 AND (lower(pr.name) = lower(cl.product) OR pr.aliases ? cl.product))) AS "potentialNewProduct",
            -- captured for later; not surfaced in the UI yet
            (cl.signal_type = 'new_feature') AS "potentialNewFeature"
       FROM classifications cl
       JOIN pages p ON p.id = cl.page_id
       JOIN competitors c ON c.id = p.competitor_id
      WHERE ($1::text IS NULL OR c.name = $1)
        AND ($2::text IS NULL OR cl.category = $2)
        AND ($3::bool IS NOT TRUE OR cl.relevant = TRUE)
      ORDER BY COALESCE(p.lastmod, p.scraped_at) DESC NULLS LAST, p.id DESC
      LIMIT $4 OFFSET $5`,
    [competitor, category, relevantOnly, limit, offset],
  );
  return rows.map((r) => ({ ...r, categoryColor: colorFor(r.category) }));
}

export async function getCompanies() {
  const { rows } = await q(
    `SELECT c.id, c.name,
            COUNT(p.id)::int AS "totalPages",
            COUNT(*) FILTER (WHERE cl.relevant)::int AS "relevantCount",
            COUNT(*) FILTER (WHERE cl.signal_type IN ('new_product','new_feature'))::int AS launches,
            MAX(COALESCE(p.lastmod, p.scraped_at)) AS "lastActivity",
            COALESCE(ARRAY_AGG(DISTINCT cl.category)
              FILTER (WHERE cl.category IS NOT NULL AND cl.category <> ALL($1)), '{}') AS categories
       FROM competitors c
       LEFT JOIN pages p ON p.competitor_id = c.id
       LEFT JOIN classifications cl ON cl.page_id = p.id
      WHERE c.active
      GROUP BY c.id, c.name
      ORDER BY "relevantCount" DESC, "lastActivity" DESC NULLS LAST`,
    [NON_SIGNAL_CATEGORIES],
  );
  return rows;
}

export async function getCategories() {
  const { rows } = await q(
    `SELECT cl.category,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE cl.relevant)::int AS "relevantCount",
            COUNT(DISTINCT p.competitor_id)::int AS "competitorCount",
            ARRAY_AGG(DISTINCT c.name) AS competitors
       FROM classifications cl
       JOIN pages p ON p.id = cl.page_id
       JOIN competitors c ON c.id = p.competitor_id
      WHERE cl.category IS NOT NULL AND cl.category <> ALL($1)
      GROUP BY cl.category`,
    [NON_SIGNAL_CATEGORIES],
  );
  // Zero-fill the full taxonomy so every product category is represented, then append
  // any observed category not in the canonical list (safety). Active categories sort first.
  const byCat = new Map(rows.map((r) => [r.category, r]));
  const all = [...new Set([...CATEGORIES, ...rows.map((r) => r.category)])];
  return all
    .map((cat) => {
      const r = byCat.get(cat) || { category: cat, total: 0, relevantCount: 0, competitorCount: 0, competitors: [] };
      return { ...r, category: cat, categoryColor: colorFor(cat) };
    })
    .sort((a, b) => b.relevantCount - a.relevantCount || b.total - a.total || a.category.localeCompare(b.category));
}

export async function buildCompetitivePayload() {
  const [feed, companies, categories] = await Promise.all([getFeed({ limit: 500 }), getCompanies(), getCategories()]);
  return { feed, companies, categories, generatedAt: new Date().toISOString() };
}

// ── Pages / signals ──────────────────────────────────────────────────────────

// relevant: 'all' | 'true' | 'false'
export async function getPages({ competitor = null, category = null, relevant = 'all', q: text = null, limit = 100, offset = 0 } = {}) {
  const relFilter = relevant === 'true' ? true : relevant === 'false' ? false : null;
  const { rows } = await q(
    `SELECT p.id, c.id AS "competitorId", c.name AS competitor, p.url, p.title,
            COALESCE(cl.summary, p.description) AS summary,
            cl.category, cl.relevant, cl.relevance_score AS "relevanceScore",
            cl.signal_type AS "signalType", cl.product, cl.reasoning,
            p.detection_source AS "detectionSource", p.lastmod, p.scraped_at AS "scrapedAt"
       FROM pages p
       JOIN competitors c ON c.id = p.competitor_id
       LEFT JOIN classifications cl ON cl.page_id = p.id
      WHERE ($1::text IS NULL OR c.name = $1)
        AND ($2::text IS NULL OR cl.category = $2)
        AND ($3::bool IS NULL OR cl.relevant = $3)
        AND ($4::text IS NULL OR p.title ILIKE '%'||$4||'%' OR cl.summary ILIKE '%'||$4||'%')
      ORDER BY COALESCE(p.lastmod, p.scraped_at) DESC NULLS LAST, p.id DESC
      LIMIT $5 OFFSET $6`,
    [competitor, category, relFilter, text, limit, offset],
  );
  return rows.map((r) => ({ ...r, categoryColor: colorFor(r.category) }));
}

// ── Competitor detail (drawer): signals + products + Telnyx comparison map ───

export async function getCompetitorById(id) {
  const { rows } = await q(`SELECT id, name, active FROM competitors WHERE id=$1`, [id]);
  return rows[0] ?? null;
}

export async function getProducts({ competitorId = null, status = null } = {}) {
  const { rows } = await q(
    `SELECT pr.id, pr.competitor_id AS "competitorId", c.name AS "competitorName",
            pr.name, pr.category, pr.aliases, pr.status, pr.first_seen_page_id AS "firstSeenPageId"
       FROM products pr JOIN competitors c ON c.id = pr.competitor_id
      WHERE ($1::bigint IS NULL OR pr.competitor_id = $1)
        AND ($2::text IS NULL OR pr.status = $2)
      ORDER BY pr.category NULLS LAST, pr.name`,
    [competitorId, status],
  );
  return rows;
}

export async function getOfferings() {
  const { rows } = await q(`SELECT id, name, category, description FROM telnyx_offerings ORDER BY category NULLS LAST, name`);
  return rows;
}

export async function getComparisons({ competitorId = null } = {}) {
  const { rows } = await q(
    `SELECT oc.id, oc.competitor_id AS "competitorId", oc.focus_area AS "focusArea",
            oc.competitor_product AS "competitorProduct", oc.verdict, oc.rationale, oc.source,
            t.id AS "telnyxOfferingId", t.name AS "telnyxOfferingName", t.category AS "telnyxOfferingCategory"
       FROM offering_comparisons oc
       LEFT JOIN telnyx_offerings t ON t.id = oc.telnyx_offering_id
      WHERE ($1::bigint IS NULL OR oc.competitor_id = $1)
      ORDER BY oc.focus_area NULLS LAST`,
    [competitorId],
  );
  return rows;
}

/** Everything the drawer needs in one call. */
export async function getCompetitorDetail(id) {
  const competitor = await getCompetitorById(id);
  if (!competitor) return null;
  const [signals, products, offerings, comparisons] = await Promise.all([
    getPages({ competitor: competitor.name, limit: 100 }),
    getProducts({ competitorId: id }),
    getOfferings(),
    getComparisons({ competitorId: id }),
  ]);
  return { competitor, signals, products, offerings, comparisons, categoryColors: CATEGORY_COLORS };
}

// ── Training queue + feedback ────────────────────────────────────────────────

export async function getQueue({ competitor = null, relevant = 'all', page = 1, pageSize = 25 } = {}) {
  const relFilter = relevant === 'true' ? true : relevant === 'false' ? false : null;
  const where = `WHERE ($1::text IS NULL OR c.name = $1) AND ($2::bool IS NULL OR cl.relevant = $2)`;
  const offset = (Math.max(1, page) - 1) * pageSize;
  const totalRes = await q(
    `SELECT COUNT(*)::int AS n FROM pages p JOIN competitors c ON c.id=p.competitor_id
       LEFT JOIN classifications cl ON cl.page_id=p.id ${where}`,
    [competitor, relFilter],
  );
  const total = totalRes.rows[0].n;
  const { rows } = await q(
    `SELECT p.id AS "pageId", c.id AS "competitorId", c.name AS competitor, p.url, p.title,
            cl.product, cl.category, cl.signal_type AS "signalType", cl.relevance_score AS "relevanceScore",
            COALESCE(cl.relevant,false) AS relevant, cl.summary, cl.reasoning, p.scraped_at AS "scrapedAt",
            EXISTS (SELECT 1 FROM feedback f WHERE f.page_id = p.id) AS reviewed
       FROM pages p JOIN competitors c ON c.id=p.competitor_id
       LEFT JOIN classifications cl ON cl.page_id=p.id
       ${where}
      ORDER BY COALESCE(p.lastmod,p.scraped_at) DESC NULLS LAST, p.id DESC
      LIMIT $3 OFFSET $4`,
    [competitor, relFilter, pageSize, offset],
  );
  const items = rows.map((r) => ({ ...r, categoryColor: colorFor(r.category) }));
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)), threshold: RELEVANCE_THRESHOLD };
}

export async function recordFeedback(pageId, body = {}) {
  const { action, reasonCategory = null, reason = null, category = null, product = null, operator = null } = body;
  const pageRes = await q(`SELECT competitor_id FROM pages WHERE id=$1`, [pageId]);
  if (!pageRes.rows[0]) return { error: 'page not found' };
  const competitorId = pageRes.rows[0].competitor_id;

  // Immediate correction on the classification (mirrors the standalone behavior).
  if (action === 'flag_irrelevant') {
    await q(`UPDATE classifications SET relevant=false, signal_type='irrelevant' WHERE page_id=$1`, [pageId]);
  } else if (action === 'recategorize' && category) {
    await q(`UPDATE classifications SET category=$2 WHERE page_id=$1`, [pageId, category]);
  } else if (action === 'reassign_product') {
    await q(`UPDATE classifications SET product=$2 WHERE page_id=$1`, [pageId, product || null]);
  }
  const ins = await q(
    `INSERT INTO feedback (page_id, competitor_id, action, reason_category, reason, operator)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [pageId, competitorId, action, reasonCategory, reason, operator],
  );
  return { ok: true, feedbackId: ins.rows[0].id };
}

// ── Products (candidate confirm / reject) ────────────────────────────────────

export async function createProduct({ competitorId, name, category = null } = {}) {
  const { rows } = await q(
    `INSERT INTO products (competitor_id, name, category, status) VALUES ($1, $2, $3, 'active')
     ON CONFLICT (competitor_id, name) DO UPDATE SET status='active', category=COALESCE(EXCLUDED.category, products.category)
     RETURNING id, competitor_id AS "competitorId", name, category, status`,
    [competitorId, name, category],
  );
  return rows[0];
}

export async function updateProduct(id, { status = null, category = null } = {}) {
  const { rows } = await q(
    `UPDATE products SET status=COALESCE($2,status), category=COALESCE($3,category)
       WHERE id=$1 RETURNING id, name, category, status`,
    [id, status, category],
  );
  return rows[0] ?? null;
}
export async function deleteProduct(id) {
  await q(`DELETE FROM products WHERE id=$1`, [id]);
  return { deleted: true, id };
}

// ── Competitors (Sources tab) ────────────────────────────────────────────────

export async function listCompetitorsHealth() {
  const { rows } = await q(
    `SELECT c.id, c.name, c.active, c.sitemap_urls AS "sitemapUrls", c.include_patterns AS "includePatterns",
            c.exclude_patterns AS "excludePatterns", c.ignored_subdomains AS "ignoredSubdomains",
            c.use_snapshot_diff AS "useSnapshotDiff",
            (SELECT MAX(rc.checked_at) FROM run_competitors rc WHERE rc.competitor_id=c.id) AS "lastChecked",
            (SELECT MAX(p.scraped_at) FROM pages p WHERE p.competitor_id=c.id) AS "lastNewPage",
            (SELECT COUNT(*)::int FROM pages p WHERE p.competitor_id=c.id) AS "totalPagesArchived",
            (SELECT COUNT(*)::int FROM pages p WHERE p.competitor_id=c.id AND p.text_length > 0) AS "scrapedOk",
            (SELECT COUNT(*)::int FROM pages p WHERE p.competitor_id=c.id AND (p.scrape_error IS NOT NULL OR COALESCE(p.text_length,0)=0)) AS "scrapeFailed",
            (SELECT s.saved_at FROM snapshots s WHERE s.competitor_id=c.id ORDER BY s.saved_at DESC LIMIT 1) AS "snapshotAt",
            (SELECT s.url_count FROM snapshots s WHERE s.competitor_id=c.id ORDER BY s.saved_at DESC LIMIT 1) AS "snapshotUrls"
       FROM competitors c ORDER BY c.name`,
  );
  return rows.map((r) => ({ ...r, detectionMethod: r.useSnapshotDiff ? 'snapshot_diff' : 'lastmod' }));
}

export async function createCompetitor(b = {}) {
  const { name, sitemapUrls = [], includePatterns = [], excludePatterns = [], ignoredSubdomains = [], useSnapshotDiff = false, active = true } = b;
  const { rows } = await q(
    `INSERT INTO competitors (name, sitemap_urls, include_patterns, exclude_patterns, ignored_subdomains, use_snapshot_diff, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, name, active, sitemap_urls AS "sitemapUrls", include_patterns AS "includePatterns",
               exclude_patterns AS "excludePatterns", ignored_subdomains AS "ignoredSubdomains", use_snapshot_diff AS "useSnapshotDiff"`,
    [name, JSON.stringify(sitemapUrls), JSON.stringify(includePatterns), JSON.stringify(excludePatterns), JSON.stringify(ignoredSubdomains), useSnapshotDiff, active],
  );
  return rows[0];
}

export async function updateCompetitor(id, b = {}) {
  const sets = [], vals = [id];
  const map = { name: 'name', useSnapshotDiff: 'use_snapshot_diff', active: 'active' };
  const jsonMap = { sitemapUrls: 'sitemap_urls', includePatterns: 'include_patterns', excludePatterns: 'exclude_patterns', ignoredSubdomains: 'ignored_subdomains' };
  for (const [k, col] of Object.entries(map)) if (b[k] !== undefined) { vals.push(b[k]); sets.push(`${col}=$${vals.length}`); }
  for (const [k, col] of Object.entries(jsonMap)) if (b[k] !== undefined) { vals.push(JSON.stringify(b[k])); sets.push(`${col}=$${vals.length}::jsonb`); }
  if (!sets.length) return getCompetitorById(id);
  const { rows } = await q(
    `UPDATE competitors SET ${sets.join(', ')} WHERE id=$1
     RETURNING id, name, active, sitemap_urls AS "sitemapUrls", include_patterns AS "includePatterns",
               exclude_patterns AS "excludePatterns", ignored_subdomains AS "ignoredSubdomains", use_snapshot_diff AS "useSnapshotDiff"`,
    vals,
  );
  return rows[0] ?? null;
}

export async function deleteCompetitor(id, force = false) {
  const cnt = (await q(`SELECT COUNT(*)::int n FROM pages WHERE competitor_id=$1`, [id])).rows[0].n;
  if (cnt > 0 && !force) return { conflict: true, removedPages: cnt };
  await q(`DELETE FROM competitors WHERE id=$1`, [id]); // FK cascade handles children
  return { deleted: true, id, removedPages: cnt };
}

// add/remove an entry inside one of the competitor's jsonb string[] columns
async function mutateArrayColumn(id, column, value, op) {
  const cur = (await q(`SELECT ${column} AS arr FROM competitors WHERE id=$1`, [id])).rows[0];
  if (!cur) return null;
  const set = new Set(cur.arr || []);
  if (op === 'add') set.add(value); else set.delete(value);
  const { rows } = await q(
    `UPDATE competitors SET ${column}=$2::jsonb WHERE id=$1
     RETURNING id, name, active, sitemap_urls AS "sitemapUrls", include_patterns AS "includePatterns",
               exclude_patterns AS "excludePatterns", ignored_subdomains AS "ignoredSubdomains", use_snapshot_diff AS "useSnapshotDiff"`,
    [id, JSON.stringify([...set])],
  );
  return rows[0];
}
export const addSource = (id, url) => mutateArrayColumn(id, 'sitemap_urls', url, 'add');
export const removeSource = (id, url) => mutateArrayColumn(id, 'sitemap_urls', url, 'del');
export const addIgnoredSubdomain = (id, host) => mutateArrayColumn(id, 'ignored_subdomains', host.toLowerCase(), 'add');
export const removeIgnoredSubdomain = (id, host) => mutateArrayColumn(id, 'ignored_subdomains', host.toLowerCase(), 'del');

// ── Removal requests (approval workflow) ─────────────────────────────────────

export async function listRemovalRequests(status = 'pending') {
  const { rows } = await q(
    `SELECT r.id, r.competitor_id AS "competitorId", c.name AS competitor, r.kind, r.value, r.host,
            r.status, r.requested_by AS "requestedBy", r.resolved_by AS "resolvedBy", r.page_id AS "pageId",
            r.created_at AS "createdAt", r.resolved_at AS "resolvedAt"
       FROM removal_requests r JOIN competitors c ON c.id=r.competitor_id
      WHERE ($1::text IS NULL OR r.status=$1) ORDER BY r.created_at DESC`,
    [status === 'all' ? null : status],
  );
  return rows;
}

export async function createRemovalRequest(b = {}) {
  const { competitorId, kind = 'endpoint', value, host = null, pageId = null, requestedBy = null } = b;
  const { rows } = await q(
    `INSERT INTO removal_requests (competitor_id, kind, value, host, page_id, requested_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [competitorId, kind, value, kind === 'subdomain' ? (host || value) : null, pageId, requestedBy],
  );
  return { id: rows[0].id, status: 'pending' };
}

export async function resolveRemoval(id, decision, resolvedBy = null) {
  const r = (await q(`SELECT * FROM removal_requests WHERE id=$1 AND status='pending'`, [id])).rows[0];
  if (!r) return { error: 'not found or already resolved' };
  if (decision === 'approve') {
    if (r.kind === 'subdomain') await mutateArrayColumn(r.competitor_id, 'ignored_subdomains', (r.host || r.value).toLowerCase(), 'add');
    else await mutateArrayColumn(r.competitor_id, 'exclude_patterns', r.value, 'add');
  }
  await q(`UPDATE removal_requests SET status=$2, resolved_by=$3, resolved_at=now() WHERE id=$1`,
    [id, decision === 'approve' ? 'approved' : 'rejected', resolvedBy]);
  return { ok: true, id, status: decision === 'approve' ? 'approved' : 'rejected', kind: r.kind, value: r.value };
}

// ── Guidance ─────────────────────────────────────────────────────────────────

export async function listGuidance() {
  const { rows } = await q(
    `SELECT g.id, g.competitor_id AS "competitorId", c.name AS "competitorName",
            COALESCE(c.name,'Global') AS scope, g.text, g.active, g.created_at AS "createdAt"
       FROM guidance g LEFT JOIN competitors c ON c.id=g.competitor_id
      ORDER BY g.created_at DESC`,
  );
  return rows;
}
export async function createGuidance({ text, competitorId = null, operator = null }) {
  const { rows } = await q(`INSERT INTO guidance (competitor_id, text, operator) VALUES ($1,$2,$3) RETURNING id`,
    [competitorId, text, operator]);
  return { id: rows[0].id };
}
export async function updateGuidance(id, { text = null, active = null }) {
  const { rows } = await q(
    `UPDATE guidance SET text=COALESCE($2,text), active=COALESCE($3,active) WHERE id=$1 RETURNING id, active, text`,
    [id, text, active]);
  return rows[0] ?? null;
}
export async function deleteGuidance(id) { await q(`DELETE FROM guidance WHERE id=$1`, [id]); return { deleted: true, id }; }

// ── Pipeline config export (closes the training loop) ────────────────────────
// Reads the DB (the source of truth) into the JSON shape competitor_monitor.py's
// --config loader expects, so operator products/guidance/feedback/exclusions are
// injected on the next run. Mirrors the standalone runner.ts writeActiveCompetitorConfig.

const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };

// Turn recent feedback into few-shot "examples" (same mapping as the standalone runner).
async function recentExamples(competitorId, limit = 8) {
  const { rows } = await q(
    `SELECT f.action, f.reason, f.reason_category AS "reasonCategory",
            p.title, p.url, cl.relevant, cl.category, cl.product
       FROM feedback f
       JOIN pages p ON p.id = f.page_id
       LEFT JOIN classifications cl ON cl.page_id = p.id
      WHERE f.competitor_id = $1 ORDER BY f.id DESC LIMIT $2`,
    [competitorId, limit],
  );
  return rows.map((f) => {
    let verdict = '';
    if (f.action === 'flag_irrelevant') verdict = 'irrelevant';
    else if (f.action === 'confirm') verdict = f.relevant ? 'relevant' : 'not relevant';
    else if (f.action === 'recategorize') verdict = `category=${f.category ?? '?'}`;
    else if (f.action === 'reassign_product') verdict = `product=${f.product ?? '?'}`;
    return { title: f.title ?? f.url, host: hostOf(f.url), verdict, reason: f.reason ?? f.reasonCategory ?? null };
  });
}

export async function exportPipelineConfig() {
  const comps = (await q(
    `SELECT id, name, sitemap_urls AS "sitemapUrls", include_patterns AS "includePatterns",
            exclude_patterns AS "excludePatterns", ignored_subdomains AS "ignoredSubdomains",
            use_snapshot_diff AS "useSnapshotDiff"
       FROM competitors WHERE active ORDER BY name`,
  )).rows;
  if (!comps.length) return [];

  const products = (await q(`SELECT competitor_id AS "competitorId", name, category, aliases FROM products WHERE status <> 'deprecated' ORDER BY name`)).rows;
  const prodByComp = new Map();
  for (const p of products) {
    const list = prodByComp.get(p.competitorId) ?? [];
    list.push({ name: p.name, category: p.category, aliases: p.aliases || [] });
    prodByComp.set(p.competitorId, list);
  }

  const guid = (await q(`SELECT competitor_id AS "competitorId", text FROM guidance WHERE active ORDER BY created_at`)).rows;
  const globalGuidance = guid.filter((g) => g.competitorId == null).map((g) => g.text);
  const guidByComp = new Map();
  for (const g of guid) {
    if (g.competitorId == null) continue;
    const list = guidByComp.get(g.competitorId) ?? [];
    list.push(g.text);
    guidByComp.set(g.competitorId, list);
  }

  const out = [];
  for (const c of comps) {
    out.push({
      name: c.name,
      sitemap_urls: c.sitemapUrls || [],
      include_patterns: c.includePatterns || [],
      exclude_patterns: c.excludePatterns || [],
      ignored_subdomains: c.ignoredSubdomains || [],
      products: prodByComp.get(c.id) ?? [],
      guidance: [...globalGuidance, ...(guidByComp.get(c.id) ?? [])],
      examples: await recentExamples(c.id),
      use_snapshot_diff: c.useSnapshotDiff,
    });
  }
  return out;
}

// ── Runs timeline (Training graph) ───────────────────────────────────────────

export async function getRuns(limit = 60) {
  const { rows } = await q(
    `SELECT r.id, r.started_at AS "startedAt", r.finished_at AS "finishedAt", r.status, r.trigger,
            r.duration_ms AS "durationMs",
            COALESCE(SUM(rc.new_page_count),0)::int AS pages,
            COALESCE(SUM(rc.relevant_count),0)::int AS relevant,
            COUNT(rc.id)::int AS competitors
       FROM runs r LEFT JOIN run_competitors rc ON rc.run_id = r.id
      GROUP BY r.id ORDER BY r.started_at ASC LIMIT $1`,
    [limit],
  );
  return rows;
}

// ── Source detail (Sources expanded view) ────────────────────────────────────

const MAX_BASES = 40;
const MAX_CHILDREN = 25;

function buildEndpointTree(urls, excludePatterns) {
  const res = (excludePatterns || []).map((p) => { try { return new RegExp(p); } catch { return null; } }).filter(Boolean);
  const isExcluded = (u) => res.some((re) => re.test(u));
  const bases = new Map();
  let consideredUrls = 0;
  for (const u of urls) {
    let path;
    try { path = new URL(u).pathname; } catch { path = String(u); }
    const segs = path.split('/').filter(Boolean);
    const base = segs[0] || '(root)';
    const seg2 = segs[1] || null;
    const excl = isExcluded(u);
    if (!excl) consideredUrls++;
    let b = bases.get(base);
    if (!b) { b = { base, path: base === '(root)' ? '/' : `/${base}`, total: 0, considered: 0, children: new Map() }; bases.set(base, b); }
    b.total++; if (!excl) b.considered++;
    if (seg2) {
      let ch = b.children.get(seg2);
      if (!ch) { ch = { seg: seg2, path: `/${base}/${seg2}`, total: 0, considered: 0 }; b.children.set(seg2, ch); }
      ch.total++; if (!excl) ch.considered++;
    }
  }
  const all = [...bases.values()].sort((a, b) => b.total - a.total);
  const shown = all.slice(0, MAX_BASES).map((b) => ({
    base: b.base, path: b.path, total: b.total, considered: b.considered, childCount: b.children.size,
    children: [...b.children.values()].sort((a, c) => c.total - a.total).slice(0, MAX_CHILDREN),
  }));
  const otherBases = Math.max(0, all.length - shown.length);
  const otherUrls = all.slice(MAX_BASES).reduce((s, b) => s + b.total, 0);
  return { bases: shown, totalBases: all.length, otherBases, otherUrls, consideredUrls };
}

export async function getSourceDetail(id) {
  const comp = (await q(
    `SELECT id, name, sitemap_urls AS "sitemapUrls", include_patterns AS "includePatterns",
            exclude_patterns AS "excludePatterns", ignored_subdomains AS "ignoredSubdomains"
       FROM competitors WHERE id=$1`, [id])).rows[0];
  if (!comp) return null;

  const snap = (await q(`SELECT urls, url_count AS "urlCount", saved_at AS "savedAt" FROM snapshots WHERE competitor_id=$1 ORDER BY saved_at DESC LIMIT 1`, [id])).rows[0];
  const totalSitemapUrls = (await q(`SELECT total_sitemap_urls FROM run_competitors WHERE competitor_id=$1 ORDER BY id DESC LIMIT 1`, [id])).rows[0]?.total_sitemap_urls ?? null;

  let inventory = null;
  if (snap?.urls?.length) {
    const tree = buildEndpointTree(snap.urls, comp.excludePatterns);
    inventory = { source: 'snapshot', totalUrls: snap.urlCount ?? snap.urls.length, savedAt: snap.savedAt, ...tree };
  }

  const stats = (await q(
    `SELECT COUNT(*)::int total,
            COUNT(*) FILTER (WHERE text_length > 0)::int scraped,
            COUNT(*) FILTER (WHERE scrape_error IS NOT NULL)::int errored,
            COUNT(*) FILTER (WHERE scrape_error IS NULL AND COALESCE(text_length,0)=0)::int empty
       FROM pages WHERE competitor_id=$1`, [id])).rows[0];
  const failures = (await q(
    `SELECT url, scrape_error AS reason FROM pages
      WHERE competitor_id=$1 AND (scrape_error IS NOT NULL OR COALESCE(text_length,0)=0)
      ORDER BY (scrape_error IS NULL), url LIMIT 100`, [id])).rows
    .map((r) => ({ url: r.url, reason: r.reason || 'no content extracted' }));

  const pendingRemovals = (await q(
    `SELECT id, value FROM removal_requests
      WHERE competitor_id=$1 AND kind='endpoint' AND status='pending' ORDER BY created_at DESC`, [id])).rows;

  return { competitor: comp, inventory, totalSitemapUrls, scrape: { ...stats, failures }, pendingRemovals };
}
