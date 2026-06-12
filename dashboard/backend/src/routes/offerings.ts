import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma, CATEGORIES } from "../db.js";

export const offeringsRouter = Router();

const VERDICTS = ["parity", "gap", "telnyx_ahead", "competitor_ahead", "none"] as const;

const offeringSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  category: z.enum(CATEGORIES).optional(),
  description: z.string().trim().max(2000).optional(),
});

const comparisonSchema = z.object({
  competitorId: z.number().int().positive(),
  focusArea: z.enum(CATEGORIES).optional(),
  competitorProduct: z.string().trim().max(200).optional(),
  telnyxOfferingId: z.number().int().positive().nullable().optional(),
  verdict: z.enum(VERDICTS).default("none"),
  rationale: z.string().trim().max(2000).optional(),
});

const comparisonUpdateSchema = z
  .object({
    focusArea: z.enum(CATEGORIES).optional(),
    competitorProduct: z.string().trim().max(200).optional(),
    telnyxOfferingId: z.number().int().positive().nullable().optional(),
    verdict: z.enum(VERDICTS).optional(),
    rationale: z.string().trim().max(2000).nullable().optional(),
    editedBy: z.string().trim().max(200).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

function isUnique(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

// ---- Telnyx offerings catalog ----

/** GET /api/offerings — the Telnyx offerings catalog (empty until seeded). */
offeringsRouter.get("/", async (_req, res) => {
  const rows = await prisma.telnyxOffering.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] });
  res.json({ items: rows });
});

/** POST /api/offerings — add a Telnyx offering. */
offeringsRouter.post("/", async (req, res) => {
  const parsed = offeringSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const created = await prisma.telnyxOffering.create({
      data: {
        name: parsed.data.name,
        category: parsed.data.category ?? null,
        description: parsed.data.description ?? null,
      },
    });
    res.status(201).json(created);
  } catch (err) {
    if (isUnique(err)) return res.status(409).json({ error: `"${parsed.data.name}" already exists` });
    throw err;
  }
});

/** DELETE /api/offerings/:id */
offeringsRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    await prisma.telnyxOffering.delete({ where: { id } });
    res.json({ deleted: true, id });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return res.status(404).json({ error: "Offering not found" });
    }
    throw err;
  }
});

// ---- Offering comparisons (competitor product ↔ Telnyx offering) ----

/** GET /api/offerings/comparisons?competitor= — comparison rows for the map. */
offeringsRouter.get("/comparisons", async (req, res) => {
  const competitor = req.query.competitor as string | undefined;
  const where: Prisma.OfferingComparisonWhereInput = {};
  if (competitor) {
    const asId = Number(competitor);
    where.competitor = Number.isInteger(asId) ? { id: asId } : { name: competitor };
  }
  const rows = await prisma.offeringComparison.findMany({
    where,
    include: {
      competitor: { select: { id: true, name: true } },
      telnyxOffering: { select: { id: true, name: true, category: true } },
    },
    orderBy: [{ competitorId: "asc" }, { focusArea: "asc" }],
  });
  res.json({ items: rows });
});

/** POST /api/offerings/comparisons — add a manual comparison row. */
offeringsRouter.post("/comparisons", async (req, res) => {
  const parsed = comparisonSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  const created = await prisma.offeringComparison.create({
    data: {
      competitorId: d.competitorId,
      focusArea: d.focusArea ?? null,
      competitorProduct: d.competitorProduct ?? null,
      telnyxOfferingId: d.telnyxOfferingId ?? null,
      verdict: d.verdict,
      rationale: d.rationale ?? null,
      source: "manual",
    },
  });
  res.status(201).json(created);
});

/** PATCH /api/offerings/comparisons/:id — operator edit (flips source to manual). */
offeringsRouter.patch("/comparisons/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = comparisonUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const data: Prisma.OfferingComparisonUpdateInput = { source: "manual" };
  if (d.focusArea !== undefined) data.focusArea = d.focusArea;
  if (d.competitorProduct !== undefined) data.competitorProduct = d.competitorProduct;
  if (d.verdict !== undefined) data.verdict = d.verdict;
  if (d.rationale !== undefined) data.rationale = d.rationale;
  if (d.editedBy !== undefined) data.editedBy = d.editedBy;
  if (d.telnyxOfferingId !== undefined) {
    data.telnyxOffering = d.telnyxOfferingId
      ? { connect: { id: d.telnyxOfferingId } }
      : { disconnect: true };
  }

  try {
    const updated = await prisma.offeringComparison.update({ where: { id }, data });
    res.json(updated);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return res.status(404).json({ error: "Comparison not found" });
    }
    throw err;
  }
});

/** DELETE /api/offerings/comparisons/:id */
offeringsRouter.delete("/comparisons/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    await prisma.offeringComparison.delete({ where: { id } });
    res.json({ deleted: true, id });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return res.status(404).json({ error: "Comparison not found" });
    }
    throw err;
  }
});
