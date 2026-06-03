import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { isValidTier } from "../domain/tiers.js";

export const rewardsRouter = Router();
rewardsRouter.use(requireAuth);

const rewardBodySchema = z.object({
  tier: z.string().refine(isValidTier, { message: "Invalid tier" }),
  label: z.string().min(1).max(500),
});

rewardsRouter.get("/", async (req: AuthedRequest, res) => {
  const tier = req.query.tier as string | undefined;
  const where: { userId: string; tier?: import("@prisma/client").RewardTier } = {
    userId: req.user!.userId,
  };
  if (tier) {
    if (!isValidTier(tier)) {
      res.status(400).json({ error: "Invalid tier" });
      return;
    }
    where.tier = tier;
  }
  const rewards = await prisma.userReward.findMany({
    where,
    orderBy: [{ tier: "asc" }, { createdAt: "asc" }],
  });
  res.json({ rewards });
});

rewardsRouter.post("/", async (req: AuthedRequest, res) => {
  try {
    const body = rewardBodySchema.parse(req.body);
    const reward = await prisma.userReward.create({
      data: {
        userId: req.user!.userId,
        tier: body.tier,
        label: body.label.trim(),
      },
    });
    res.status(201).json({ reward });
  } catch (e) {
    const err = e as Error;
    res.status(400).json({ error: err.message });
  }
});

rewardsRouter.patch("/:id", async (req: AuthedRequest, res) => {
  try {
    const body = z.object({ label: z.string().min(1).max(500) }).parse(req.body);
    const rewardId = String(req.params.id);
    const existing = await prisma.userReward.findFirst({
      where: { id: rewardId, userId: req.user!.userId },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const reward = await prisma.userReward.update({
      where: { id: existing.id },
      data: { label: body.label.trim() },
    });
    res.json({ reward });
  } catch (e) {
    const err = e as Error;
    res.status(400).json({ error: err.message });
  }
});

rewardsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const rewardId = String(req.params.id);
  const existing = await prisma.userReward.findFirst({
    where: { id: rewardId, userId: req.user!.userId },
  });
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await prisma.userReward.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});
