import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma, encodeJson, decodeStringArray, CATEGORIES } from "../db.js";

export const productsRouter = Router();

const STATUSES = ["active", "candidate", "deprecated"] as const;

const createSchema = z.object({
  competitorId: z.number().int().positive(),
  name: z.string().trim().min(1, "Name is required"),
  category: z.enum(CATEGORIES).optional(),
  aliases: z.array(z.string().trim().min(1)).default([]),
  status: z.enum(STATUSES).default("active"),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    category: z.enum(CATEGORIES).nullable().optional(),
    aliases: z.array(z.string().trim().min(1)).optional(),
    status: z.enum(STATUSES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

type ProductRow = Prisma.ProductGetPayload<{ include: { competitor: true } }>;

function serialize(p: ProductRow) {
  return {
    id: p.id,
    competitor: { id: p.competitorId, name: p.competitor?.name },
    name: p.name,
    category: p.category,
    aliases: decodeStringArray(p.aliases),
    status: p.status,
    firstSeenPageId: p.firstSeenPageId,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** GET /api/products?status=&competitor= — list the registry (and candidates). */
productsRouter.get("/", async (req, res) => {
  const status = req.query.status as string | undefined;
  const competitor = req.query.competitor as string | undefined;

  const where: Prisma.ProductWhereInput = {};
  if (status) where.status = status;
  if (competitor) {
    const asId = Number(competitor);
    where.competitor = Number.isInteger(asId) ? { id: asId } : { name: competitor };
  }

  const rows = await prisma.product.findMany({
    where,
    include: { competitor: true },
    orderBy: [{ competitor: { name: "asc" } }, { name: "asc" }],
  });
  res.json({ items: rows.map(serialize) });
});

/** POST /api/products — add a product to a competitor's registry. */
productsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  try {
    const created = await prisma.product.create({
      data: {
        competitorId: d.competitorId,
        name: d.name,
        category: d.category ?? null,
        aliases: encodeJson(d.aliases),
        status: d.status,
      },
      include: { competitor: true },
    });
    res.status(201).json(serialize(created));
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: `"${d.name}" already exists for this competitor` });
    }
    throw err;
  }
});

/** PATCH /api/products/:id — edit / confirm a candidate (status → active). */
productsRouter.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = updateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const data: Prisma.ProductUpdateInput = {};
  if (d.name !== undefined) data.name = d.name;
  if (d.category !== undefined) data.category = d.category;
  if (d.aliases !== undefined) data.aliases = encodeJson(d.aliases);
  if (d.status !== undefined) data.status = d.status;

  try {
    const updated = await prisma.product.update({
      where: { id },
      data,
      include: { competitor: true },
    });
    res.json(serialize(updated));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return res.status(404).json({ error: "Product not found" });
    }
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: "A product with that name already exists" });
    }
    throw err;
  }
});

/** DELETE /api/products/:id — remove a product (e.g. reject a candidate). */
productsRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    await prisma.product.delete({ where: { id } });
    res.json({ deleted: true, id });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return res.status(404).json({ error: "Product not found" });
    }
    throw err;
  }
});
