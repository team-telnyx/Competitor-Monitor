import fs from "node:fs/promises";
import path from "node:path";
import { prisma, decodeStringArray } from "./db.js";
import { REPO_ROOT } from "./config.js";

// Mirrors tools/inference.py rubric constants.
const RUBRIC_VERSION = "v1";
const RELEVANCE_THRESHOLD = 40;

const RUBRIC_ROWS = [
  ["90–100", "new_product", "New product launch / flagship capability"],
  ["70–89", "new_feature", "New feature on an existing product"],
  ["40–69", "update", "Incremental update (perf, pricing, latency)"],
  ["15–39", "tangential", "Customer story, webinar, partnership"],
  ["0–14", "irrelevant", "Careers, legal, brand, events, marketing"],
];

/**
 * Regenerate docs/relevance-policy.md from the live DB — the "scope changes
 * visible in a markdown file" (docs/inference-training.md §7). Reflects the
 * rubric, tracked products, active ignore rules, guidance, and recent feedback.
 */
export async function generatePolicyDoc(): Promise<string> {
  const [competitors, guidance, feedback, recentReqs] = await Promise.all([
    prisma.competitor.findMany({
      orderBy: { name: "asc" },
      include: { products: { orderBy: { name: "asc" } } },
    }),
    prisma.guidance.findMany({
      where: { active: true },
      include: { competitor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.feedback.groupBy({
      by: ["reasonCategory"],
      _count: { _all: true },
    }),
    prisma.removalRequest.findMany({
      where: { status: "approved" },
      include: { competitor: { select: { name: true } } },
      orderBy: { resolvedAt: "desc" },
      take: 20,
    }),
  ]);

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);

  push("# Relevance Policy (generated)");
  push();
  push(`> Auto-generated from the dashboard DB. Do not edit by hand — regenerate via`);
  push(`> \`POST /api/policy/regenerate\`. Design: [inference-training.md](./inference-training.md).`);
  push();
  push(`Rubric version: **${RUBRIC_VERSION}** · relevance threshold: **${RELEVANCE_THRESHOLD}** (a page is "relevant" at/above this score).`);
  push();

  push("## Rubric");
  push();
  push("| Score | signal_type | Meaning |");
  push("|---|---|---|");
  for (const [score, sig, meaning] of RUBRIC_ROWS) push(`| ${score} | \`${sig}\` | ${meaning} |`);
  push();

  push("## Tracked products & exclusion rules by competitor");
  push();
  for (const c of competitors) {
    const ignored = decodeStringArray(c.ignoredSubdomains);
    const excludes = decodeStringArray(c.excludePatterns);
    const active = c.products.filter((p) => p.status === "active");
    const candidates = c.products.filter((p) => p.status === "candidate");
    push(`### ${c.name}${c.active ? "" : " _(inactive)_"}`);
    push();
    push(`- **Products (${active.length}):** ${active.map((p) => `${p.name}${p.category ? ` (${p.category})` : ""}`).join(", ") || "_none_"}`);
    if (candidates.length) {
      push(`- **Candidate products (${candidates.length}):** ${candidates.map((p) => p.name).join(", ")}`);
    }
    push(`- **Excluded endpoints:** ${excludes.length ? excludes.map((p) => `\`${p}\``).join(", ") : "_none_"}`);
    // Only mention subdomains when a competitor actually has DNS subdomains ignored.
    if (ignored.length) {
      push(`- **Ignored subdomains:** ${ignored.map((h) => `\`${h}\``).join(", ")}`);
    }
    push();
  }

  push("## Operator guidance (injected into classification)");
  push();
  if (guidance.length === 0) {
    push("_No active guidance._");
  } else {
    for (const g of guidance) {
      push(`- **${g.competitor?.name ?? "Global"}:** ${g.text}`);
    }
  }
  push();

  push("## Approved removals (recent)");
  push();
  if (recentReqs.length === 0) {
    push("_None._");
  } else {
    for (const r of recentReqs) {
      push(`- \`${r.value ?? r.host}\` — ${r.kind} (${r.competitor.name})`);
    }
  }
  push();

  push("## Feedback summary");
  push();
  if (feedback.length === 0) {
    push("_No operator feedback recorded yet._");
  } else {
    push("| Reason category | Count |");
    push("|---|---|");
    for (const f of feedback) push(`| ${f.reasonCategory ?? "(none)"} | ${f._count._all} |`);
  }
  push();

  const content = lines.join("\n");
  const outPath = path.resolve(REPO_ROOT, "docs", "relevance-policy.md");
  await fs.writeFile(outPath, content, "utf8");
  return outPath;
}
