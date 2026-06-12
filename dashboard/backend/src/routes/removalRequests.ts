import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma, encodeJson, decodeStringArray } from "../db.js";

export const removalRequestsRouter = Router();

const HOST_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** Normalize input to a bare hostname (strip scheme/path/case/dots). */
function normalizeHost(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .split("/")[0]
    .split("?")[0]
    .replace(/^\.+|\.+$/g, "");
}

/** Normalize an endpoint to a leading-slash path (accepts a full URL too). */
function normalizeEndpoint(input: string): string {
  let s = input.trim();
  if (/^https?:\/\//i.test(s)) {
    try {
      s = new URL(s).pathname;
    } catch {
      /* keep as-is */
    }
  }
  s = s.split("?")[0].split("#")[0];
  if (!s.startsWith("/")) s = "/" + s;
  s = s.replace(/\/{2,}/g, "/");
  if (s.length > 1) s = s.replace(/\/+$/, ""); // trim trailing slash (but keep "/")
  return s;
}

const createSchema = z.object({
  competitorId: z.number().int().positive(),
  kind: z.enum(["endpoint", "subdomain"]).default("endpoint"),
  value: z.string().trim().min(1).max(300),
  pageId: z.number().int().positive().optional(),
  requestedBy: z.string().trim().max(200).optional(),
});

const resolveSchema = z.object({ resolvedBy: z.string().trim().max(200).optional() });

type RequestRow = Prisma.RemovalRequestGetPayload<{
  include: { competitor: { select: { id: true; name: true } } };
}>;

function serialize(r: RequestRow) {
  return {
    id: r.id,
    competitor: r.competitor,
    kind: r.kind,
    value: r.value ?? r.host ?? "",
    host: r.host,
    status: r.status,
    requestedBy: r.requestedBy,
    resolvedBy: r.resolvedBy,
    pageId: r.pageId,
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt,
  };
}

/** GET /api/removal-requests?status=pending|approved|rejected */
removalRequestsRouter.get("/", async (req, res) => {
  const status = req.query.status as string | undefined;
  const rows = await prisma.removalRequest.findMany({
    where: status ? { status } : {},
    include: { competitor: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ items: rows.map(serialize) });
});

/**
 * POST /api/removal-requests — request removing a subdomain or endpoint from
 * consideration. Creates a PENDING request; on approval a subdomain is added to
 * ignoredSubdomains and an endpoint to excludePatterns (docs/inference-training.md §5).
 */
removalRequestsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  let value: string;
  if (d.kind === "subdomain") {
    value = normalizeHost(d.value);
    if (!HOST_RE.test(value)) {
      return res.status(400).json({ error: "Subdomain must be a hostname like community.example.com" });
    }
  } else {
    value = normalizeEndpoint(d.value);
    if (value.length < 2) {
      return res.status(400).json({ error: "Endpoint must be a path like /blog/authors" });
    }
  }

  const competitor = await prisma.competitor.findUnique({
    where: { id: d.competitorId },
    select: { id: true, ignoredSubdomains: true, excludePatterns: true },
  });
  if (!competitor) return res.status(404).json({ error: "Competitor not found" });

  const current =
    d.kind === "subdomain"
      ? decodeStringArray(competitor.ignoredSubdomains)
      : decodeStringArray(competitor.excludePatterns);
  if (current.includes(value)) {
    return res.status(409).json({ error: `That ${d.kind} is already removed` });
  }
  const existingPending = await prisma.removalRequest.findFirst({
    where: { competitorId: d.competitorId, kind: d.kind, value, status: "pending" },
  });
  if (existingPending) {
    return res.status(409).json({ error: `A removal request for that ${d.kind} is already pending` });
  }

  const created = await prisma.removalRequest.create({
    data: {
      competitorId: d.competitorId,
      kind: d.kind,
      value,
      host: d.kind === "subdomain" ? value : null,
      pageId: d.pageId ?? null,
      requestedBy: d.requestedBy ?? null,
    },
    include: { competitor: { select: { id: true, name: true } } },
  });
  res.status(201).json(serialize(created));
});

/** POST /api/removal-requests/:id/approve — apply: add to the right list. */
removalRequestsRouter.post("/:id/approve", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = resolveSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const reqRow = await prisma.removalRequest.findUnique({ where: { id } });
  if (!reqRow) return res.status(404).json({ error: "Request not found" });
  if (reqRow.status !== "pending") {
    return res.status(409).json({ error: `Request already ${reqRow.status}` });
  }

  const value = reqRow.value ?? reqRow.host ?? "";
  const competitor = await prisma.competitor.findUnique({
    where: { id: reqRow.competitorId },
    select: { ignoredSubdomains: true, excludePatterns: true },
  });

  const field = reqRow.kind === "subdomain" ? "ignoredSubdomains" : "excludePatterns";
  const list = decodeStringArray(competitor?.[field]);
  if (!list.includes(value)) list.push(value);

  await prisma.$transaction([
    prisma.competitor.update({
      where: { id: reqRow.competitorId },
      data: { [field]: encodeJson(list) },
    }),
    prisma.removalRequest.update({
      where: { id },
      data: { status: "approved", resolvedBy: parsed.data.resolvedBy ?? null, resolvedAt: new Date() },
    }),
  ]);
  res.json({ ok: true, id, status: "approved", kind: reqRow.kind, value });
});

/** POST /api/removal-requests/:id/reject */
removalRequestsRouter.post("/:id/reject", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = resolveSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const reqRow = await prisma.removalRequest.findUnique({ where: { id } });
  if (!reqRow) return res.status(404).json({ error: "Request not found" });
  if (reqRow.status !== "pending") {
    return res.status(409).json({ error: `Request already ${reqRow.status}` });
  }
  await prisma.removalRequest.update({
    where: { id },
    data: { status: "rejected", resolvedBy: parsed.data.resolvedBy ?? null, resolvedAt: new Date() },
  });
  res.json({ ok: true, id, status: "rejected" });
});
