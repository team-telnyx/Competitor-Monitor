import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

export const guidanceRouter = Router();

const createSchema = z.object({
  competitorId: z.number().int().positive().nullable().optional(),
  text: z.string().trim().min(1, "Guidance text is required").max(4000),
  operator: z.string().trim().max(200).optional(),
});

const updateSchema = z
  .object({
    text: z.string().trim().min(1).max(4000).optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

/**
 * GET /api/guidance?competitor=  — operator notes fed to the classifier.
 * With ?competitor=, returns global guidance + that competitor's; otherwise all.
 */
guidanceRouter.get("/", async (req, res) => {
  const competitor = req.query.competitor as string | undefined;
  let where: Prisma.GuidanceWhereInput = {};
  if (competitor) {
    const asId = Number(competitor);
    const comp = Number.isInteger(asId)
      ? await prisma.competitor.findUnique({ where: { id: asId }, select: { id: true } })
      : await prisma.competitor.findUnique({ where: { name: competitor }, select: { id: true } });
    where = { OR: [{ competitorId: null }, { competitorId: comp?.id ?? -1 }] };
  }
  const rows = await prisma.guidance.findMany({
    where,
    include: { competitor: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({
    items: rows.map((g) => ({
      id: g.id,
      competitor: g.competitor ?? null,
      scope: g.competitor ? g.competitor.name : "Global",
      text: g.text,
      active: g.active,
      createdAt: g.createdAt,
    })),
  });
});

/** POST /api/guidance — add a guidance note (global if competitorId omitted). */
guidanceRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  const created = await prisma.guidance.create({
    data: {
      competitorId: d.competitorId ?? null,
      text: d.text,
      operator: d.operator ?? null,
    },
  });
  res.status(201).json({ id: created.id });
});

/** PATCH /api/guidance/:id — toggle active / edit text. */
guidanceRouter.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = updateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const updated = await prisma.guidance.update({ where: { id }, data: parsed.data });
  res.json({ id: updated.id, active: updated.active, text: updated.text });
});

/** DELETE /api/guidance/:id */
guidanceRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  await prisma.guidance.delete({ where: { id } });
  res.json({ deleted: true, id });
});
