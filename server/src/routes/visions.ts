import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { serializeVision } from "../domain/visions.js";
import { nextVisionSortOrder } from "../services/goals.js";
import { goalsRouter } from "./goals.js";

export const visionsRouter = Router();
visionsRouter.use(requireAuth);

const visionBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
});

visionsRouter.get("/", async (req: AuthedRequest, res) => {
  const visions = await prisma.vision.findMany({
    where: { userId: req.user!.userId, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  res.json({ visions: visions.map(serializeVision) });
});

visionsRouter.post("/", async (req: AuthedRequest, res) => {
  try {
    const body = visionBodySchema.parse(req.body);
    const sortOrder = await nextVisionSortOrder(req.user!.userId);
    const vision = await prisma.vision.create({
      data: {
        userId: req.user!.userId,
        name: body.name,
        sortOrder,
      },
    });
    res.status(201).json(serializeVision(vision));
  } catch (e) {
    const err = e as Error;
    res.status(400).json({ error: err.message });
  }
});

const reorderBodySchema = z.object({
  visionIds: z.array(z.string().trim().min(1)).min(1),
});

visionsRouter.put("/reorder", async (req: AuthedRequest, res) => {
  try {
    const body = reorderBodySchema.parse(req.body);
    const userId = req.user!.userId;

    if (new Set(body.visionIds).size !== body.visionIds.length) {
      res.status(400).json({ error: "Duplicate vision ids" });
      return;
    }

    const visions = await prisma.vision.findMany({
      where: { userId, archivedAt: null, id: { in: body.visionIds } },
      select: { id: true },
    });

    if (visions.length !== body.visionIds.length) {
      res.status(400).json({ error: "Invalid vision list" });
      return;
    }

    const total = await prisma.vision.count({
      where: { userId, archivedAt: null },
    });
    if (total !== body.visionIds.length) {
      res.status(400).json({ error: "Must include all visions" });
      return;
    }

    await prisma.$transaction(
      body.visionIds.map((id, index) =>
        prisma.vision.update({
          where: { id },
          data: { sortOrder: index },
        })
      )
    );

    res.json({ ok: true });
  } catch (e) {
    const err = e as Error;
    res.status(400).json({ error: err.message });
  }
});

visionsRouter.patch("/:id", async (req: AuthedRequest, res) => {
  try {
    const body = visionBodySchema.partial().parse(req.body);
    const existing = await prisma.vision.findFirst({
      where: { id: String(req.params.id), userId: req.user!.userId, archivedAt: null },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const vision = await prisma.vision.update({
      where: { id: existing.id },
      data: { name: body.name ?? existing.name },
    });
    res.json(serializeVision(vision));
  } catch (e) {
    const err = e as Error;
    res.status(400).json({ error: err.message });
  }
});

visionsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const existing = await prisma.vision.findFirst({
    where: { id: String(req.params.id), userId: req.user!.userId },
  });
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await prisma.vision.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

visionsRouter.use("/:visionId/goals", goalsRouter);
