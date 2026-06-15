/**
 * GET /api/competitive — the Competitive Intelligence payload, served from cache.
 *
 * Mirrors routes/inference.js: routes never touch the DB live; they serve whatever
 * scheduler.refreshCompetitive() last wrote to the file cache. The page filters the
 * feed client-side (competitor / category / relevant-only), exactly as the current
 * static CompetitiveIntelligence.tsx already does over its UPDATES[] array.
 *
 * Target location: server/routes/competitive.js
 */
import { Router } from 'express';
import { readCache } from '../cache.js';

const router = Router();

router.get('/', (_req, res) => {
  const entry = readCache('competitive');
  if (!entry) {
    return res.status(503).json({ error: 'Data not ready yet — refresh in progress' });
  }
  res.json(entry.data);
});

export default router;
