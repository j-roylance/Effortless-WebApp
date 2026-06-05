import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { serializeVision } from "../domain/visions.js";
import { createGoalPenultimate, serializeGoal } from "../services/goals.js";

export const goalsRouter = Router({ mergeParams: true });
goalsRouter.use(requireAuth);

const goalBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
});

const goalPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  completed: z.boolean().optional(),
});

async function loadVisionForUser(visionId: string, userId: string) {
  return prisma.vision.findFirst({
    where: { id: visionId, userId, archivedAt: null },
  });
}

goalsRouter.get("/", async (req: AuthedRequest, res) => {
  const visionId = String(req.params.visionId);
  const vision = await loadVisionForUser(visionId, req.user!.userId);
  if (!vision) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const goals = await prisma.goal.findMany({
    where: { visionId, userId: req.user!.userId },
    orderBy: { sortOrder: "asc" },
  });

  res.json({
    vision: serializeVision(vision),
    goals: goals.map(serializeGoal),
  });
});

goalsRouter.post("/", async (req: AuthedRequest, res) => {
  try {
    const visionId = String(req.params.visionId);
    const vision = await loadVisionForUser(visionId, req.user!.userId);
    if (!vision) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const body = goalBodySchema.parse(req.body);
    const goal = await prisma.$transaction((tx) =>
      createGoalPenultimate(tx, req.user!.userId, visionId, body.name)
    );

    res.status(201).json(serializeGoal(goal));
  } catch (e) {
    const err = e as Error;
    res.status(400).json({ error: err.message });
  }
});

goalsRouter.patch("/:goalId", async (req: AuthedRequest, res) => {
  try {
    const visionId = String(req.params.visionId);
    const goalId = String(req.params.goalId);
    const vision = await loadVisionForUser(visionId, req.user!.userId);
    if (!vision) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const existing = await prisma.goal.findFirst({
      where: { id: goalId, visionId, userId: req.user!.userId },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const body = goalPatchSchema.parse(req.body);
    const completedAt =
      body.completed === undefined
        ? existing.completedAt
        : body.completed
          ? existing.completedAt ?? new Date()
          : null;

    const goal = await prisma.goal.update({
      where: { id: existing.id },
      data: {
        name: body.name ?? existing.name,
        completedAt,
      },
    });

    res.json(serializeGoal(goal));
  } catch (e) {
    const err = e as Error;
    res.status(400).json({ error: err.message });
  }
});

goalsRouter.delete("/:goalId", async (req: AuthedRequest, res) => {
  const visionId = String(req.params.visionId);
  const goalId = String(req.params.goalId);
  const vision = await loadVisionForUser(visionId, req.user!.userId);
  if (!vision) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const existing = await prisma.goal.findFirst({
    where: { id: goalId, visionId, userId: req.user!.userId },
  });
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await prisma.goal.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});
