import { Router } from "express";
import path from "node:path";
import { generatePolicyDoc } from "../policyDoc.js";
import { REPO_ROOT } from "../config.js";

export const policyRouter = Router();

/** POST /api/policy/regenerate — rewrite docs/relevance-policy.md from the DB. */
policyRouter.post("/regenerate", async (_req, res) => {
  const outPath = await generatePolicyDoc();
  res.json({ ok: true, path: path.relative(REPO_ROOT, outPath) });
});
