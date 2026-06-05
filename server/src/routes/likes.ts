import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { isValidTier } from "../domain/tiers.js";

export const likesRouter = Router();
likesRouter.use(requireAuth);

const likeBodySchema = z.object({
  tier: z.string().refine(isValidTier, { message: "Invalid tier" }),
  label: z.string().min(1).max(500),
});

likesRouter.get("/", async (req: AuthedRequest, res) => {
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
  const likes = await prisma.userReward.findMany({
    where,
    orderBy: [{ tier: "asc" }, { createdAt: "asc" }],
  });
  res.json({ likes });
});

likesRouter.post("/", async (req: AuthedRequest, res) => {
  try {
    const body = likeBodySchema.parse(req.body);
    const like = await prisma.userReward.create({
      data: {
        userId: req.user!.userId,
        tier: body.tier,
        label: body.label.trim(),
      },
    });
    res.status(201).json({ like });
  } catch (e) {
    const err = e as Error;
    res.status(400).json({ error: err.message });
  }
});

likesRouter.patch("/:id", async (req: AuthedRequest, res) => {
  try {
    const body = z.object({ label: z.string().min(1).max(500) }).parse(req.body);
    const likeId = String(req.params.id);
    const existing = await prisma.userReward.findFirst({
      where: { id: likeId, userId: req.user!.userId },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const like = await prisma.userReward.update({
      where: { id: existing.id },
      data: { label: body.label.trim() },
    });
    res.json({ like });
  } catch (e) {
    const err = e as Error;
    res.status(400).json({ error: err.message });
  }
});

likesRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const likeId = String(req.params.id);
  const existing = await prisma.userReward.findFirst({
    where: { id: likeId, userId: req.user!.userId },
  });
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await prisma.userReward.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});
