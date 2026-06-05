import { RewardTier } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { isValidTier } from "../domain/tiers.js";

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

const taskBodySchema = z.object({
  name: z.string().min(1).max(200),
  tier: z.string().refine(isValidTier, { message: "Invalid tier" }),
  persistAfterDone: z.boolean().optional(),
});

tasksRouter.get("/", async (req: AuthedRequest, res) => {
  const rows = await prisma.habit.findMany({
    where: { userId: req.user!.userId, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  res.json({ tasks: rows });
});

/** New task grants +1 Bronze token (source: task_create). */
tasksRouter.post("/", async (req: AuthedRequest, res) => {
  try {
    const body = taskBodySchema.parse(req.body);
    const count = await prisma.habit.count({
      where: { userId: req.user!.userId, archivedAt: null },
    });

    const result = await prisma.$transaction(async (tx) => {
      const task = await tx.habit.create({
        data: {
          userId: req.user!.userId,
          name: body.name.trim(),
          tier: body.tier,
          persistAfterDone: body.persistAfterDone ?? true,
          sortOrder: count,
        },
      });

      const token = await tx.rewardToken.create({
        data: {
          userId: req.user!.userId,
          tier: RewardTier.Bronze,
          source: "task_create",
        },
      });

      return { task, token };
    });

    res.status(201).json({
      task: result.task,
      token: { id: result.token.id, tier: result.token.tier },
    });
  } catch (e) {
    const err = e as Error;
    res.status(400).json({ error: err.message });
  }
});

tasksRouter.patch("/:id", async (req: AuthedRequest, res) => {
  try {
    const taskId = String(req.params.id);
    const body = taskBodySchema.partial().parse(req.body);
    const existing = await prisma.habit.findFirst({
      where: { id: taskId, userId: req.user!.userId },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const task = await prisma.habit.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.tier !== undefined && { tier: body.tier }),
        ...(body.persistAfterDone !== undefined && {
          persistAfterDone: body.persistAfterDone,
        }),
      },
    });
    res.json({ task });
  } catch (e) {
    const err = e as Error;
    res.status(400).json({ error: err.message });
  }
});

tasksRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const taskId = String(req.params.id);
  const existing = await prisma.habit.findFirst({
    where: { id: taskId, userId: req.user!.userId },
  });
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await prisma.habit.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

/** Complete task; grant token at task tier; archive if one-time. */
tasksRouter.post("/:id/achieve", async (req: AuthedRequest, res) => {
  const taskId = String(req.params.id);
  const task = await prisma.habit.findFirst({
    where: { id: taskId, userId: req.user!.userId, archivedAt: null },
  });
  if (!task) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const token = await tx.rewardToken.create({
      data: {
        userId: req.user!.userId,
        tier: task.tier,
        source: "task_achieve",
      },
    });

    const updated = await tx.habit.update({
      where: { id: task.id },
      data: {
        achievedAt: new Date(),
        ...(!task.persistAfterDone && { archivedAt: new Date() }),
      },
    });

    return { token, task: updated };
  });

  res.json({
    task: result.task,
    token: { id: result.token.id, tier: result.token.tier },
  });
});
