import { RewardTier } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { isValidTier } from "../domain/tiers.js";

export const habitsRouter = Router();
habitsRouter.use(requireAuth);

const habitBodySchema = z.object({
  name: z.string().min(1).max(200),
  tier: z.string().refine(isValidTier, { message: "Invalid tier" }),
  persistAfterDone: z.boolean().optional(),
});

habitsRouter.get("/", async (req: AuthedRequest, res) => {
  const habits = await prisma.habit.findMany({
    where: { userId: req.user!.userId, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  res.json({ habits });
});

habitsRouter.post("/", async (req: AuthedRequest, res) => {
  try {
    const body = habitBodySchema.parse(req.body);
    const count = await prisma.habit.count({
      where: { userId: req.user!.userId, archivedAt: null },
    });

    const result = await prisma.$transaction(async (tx) => {
      const habit = await tx.habit.create({
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
          source: "habit_create",
        },
      });

      return { habit, token };
    });

    res.status(201).json({
      habit: result.habit,
      token: { id: result.token.id, tier: result.token.tier },
    });
  } catch (e) {
    const err = e as Error;
    res.status(400).json({ error: err.message });
  }
});

habitsRouter.patch("/:id", async (req: AuthedRequest, res) => {
  try {
    const habitId = String(req.params.id);
    const body = habitBodySchema.partial().parse(req.body);
    const existing = await prisma.habit.findFirst({
      where: { id: habitId, userId: req.user!.userId },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const habit = await prisma.habit.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.tier !== undefined && { tier: body.tier }),
        ...(body.persistAfterDone !== undefined && {
          persistAfterDone: body.persistAfterDone,
        }),
      },
    });
    res.json({ habit });
  } catch (e) {
    const err = e as Error;
    res.status(400).json({ error: err.message });
  }
});

habitsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const habitId = String(req.params.id);
  const existing = await prisma.habit.findFirst({
    where: { id: habitId, userId: req.user!.userId },
  });
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await prisma.habit.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

habitsRouter.post("/:id/achieve", async (req: AuthedRequest, res) => {
  const habitId = String(req.params.id);
  const habit = await prisma.habit.findFirst({
    where: { id: habitId, userId: req.user!.userId, archivedAt: null },
  });
  if (!habit) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const token = await tx.rewardToken.create({
      data: {
        userId: req.user!.userId,
        tier: habit.tier,
        source: "habit_achieve",
      },
    });

    const updated = await tx.habit.update({
      where: { id: habit.id },
      data: {
        achievedAt: new Date(),
        ...(!habit.persistAfterDone && { archivedAt: new Date() }),
      },
    });

    return { token, habit: updated };
  });

  res.json({
    habit: result.habit,
    token: { id: result.token.id, tier: result.token.tier },
  });
});
