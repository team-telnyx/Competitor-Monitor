/**
 * Competitive Intelligence — read query layer (plg-dashboard `server/db/competitive.js`).
 *
 * Plain-JS ESM, standard `pg` driver (portable — reached purely via DATABASE_URL, so the
 * same code runs against the bundled test Postgres and pgbot-main-18's competitor_intel
 * unchanged). These functions turn the shared schema (db/migrations/*.sql) into the
 * payload the CompetitiveIntelligence page consumes. scheduler.refreshCompetitive() calls
 * buildCompetitivePayload() and writes the result to the file cache; routes/competitive.js
 * serves from that cache.
 *
 * The pipeline (tools/write_db.py) is the writer; this is the reader. Same schema.
 */
import pg from 'pg';

const { Pool } = pg;

let pool;
export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Small pool — reads are cheap and cached upstream; keep DB connections modest.
      max: 4,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 15_000,
    });
  }
  return pool;
}

// Categories that are not real competitive signal — excluded from rollups.
const NON_SIGNAL_CATEGORIES = ['Not Relevant'];

/**
 * Feed: newest scored items, optionally filtered. Mirrors the page's Feed tab.
 * @param {{competitor?:string, category?:string, relevantOnly?:boolean, limit?:number, offset?:number}} opts
 */
export async function getFeed(opts = {}) {
  const { competitor = null, category = null, relevantOnly = false,
          limit = 100, offset = 0 } = opts;
  const { rows } = await getPool().query(
    `SELECT p.id,
            c.name                              AS competitor,
            cl.category,
            cl.signal_type                      AS "signalType",
            cl.relevance_score                  AS "relevanceScore",
            cl.relevant,
            p.title,
            cl.summary,
            p.url,
            COALESCE(p.lastmod, p.scraped_at)   AS date
       FROM classifications cl
       JOIN pages p        ON p.id = cl.page_id
       JOIN competitors c  ON c.id = p.competitor_id
      WHERE ($1::text IS NULL OR c.name = $1)
        AND ($2::text IS NULL OR cl.category = $2)
        AND ($3::bool IS NOT TRUE OR cl.relevant = TRUE)
      ORDER BY COALESCE(p.lastmod, p.scraped_at) DESC NULLS LAST, p.id DESC
      LIMIT $4 OFFSET $5`,
    [competitor, category, relevantOnly, limit, offset],
  );
  return rows;
}

/** Companies: per-competitor rollup for the Companies tab + cards. */
export async function getCompanies() {
  const { rows } = await getPool().query(
    `SELECT c.id,
            c.name,
            COUNT(p.id)::int                                     AS "totalPages",
            COUNT(*) FILTER (WHERE cl.relevant)::int             AS "relevantCount",
            COUNT(*) FILTER (WHERE cl.signal_type IN ('new_product','new_feature'))::int
                                                                 AS launches,
            MAX(COALESCE(p.lastmod, p.scraped_at))              AS "lastActivity",
            COALESCE(
              ARRAY_AGG(DISTINCT cl.category)
                FILTER (WHERE cl.category IS NOT NULL AND cl.category <> ALL($1)),
              '{}'
            )                                                    AS categories
       FROM competitors c
       LEFT JOIN pages p           ON p.competitor_id = c.id
       LEFT JOIN classifications cl ON cl.page_id = p.id
      WHERE c.active
      GROUP BY c.id, c.name
      ORDER BY "relevantCount" DESC, "lastActivity" DESC NULLS LAST`,
    [NON_SIGNAL_CATEGORIES],
  );
  return rows;
}

/** Categories: per-category coverage across competitors for the Categories tab. */
export async function getCategories() {
  const { rows } = await getPool().query(
    `SELECT cl.category,
            COUNT(*)::int                          AS total,
            COUNT(*) FILTER (WHERE cl.relevant)::int AS "relevantCount",
            COUNT(DISTINCT p.competitor_id)::int   AS "competitorCount",
            ARRAY_AGG(DISTINCT c.name)             AS competitors
       FROM classifications cl
       JOIN pages p       ON p.id = cl.page_id
       JOIN competitors c ON c.id = p.competitor_id
      WHERE cl.category IS NOT NULL AND cl.category <> ALL($1)
      GROUP BY cl.category
      ORDER BY "relevantCount" DESC`,
    [NON_SIGNAL_CATEGORIES],
  );
  return rows;
}

/**
 * Assemble the full cache payload. scheduler.refreshCompetitive() does:
 *   writeCache('competitive', await buildCompetitivePayload())
 */
export async function buildCompetitivePayload() {
  const [feed, companies, categories] = await Promise.all([
    getFeed({ limit: 500 }),
    getCompanies(),
    getCategories(),
  ]);
  return { feed, companies, categories, generatedAt: new Date().toISOString() };
}
