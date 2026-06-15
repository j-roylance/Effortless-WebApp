import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { isValidTier } from "../domain/tiers.js";
import { safeTimeZone } from "../domain/daily.js";
import {
  adjustLikeUsedCount,
  combineLikeCredits,
  likesWithTracking,
  resetTierLikeTracking,
  splitLikeCredit,
} from "../services/like-tracking.js";

export const likesRouter = Router();
likesRouter.use(requireAuth);

const likeBodySchema = z.object({
  tier: z.string().refine(isValidTier, { message: "Invalid tier" }),
  label: z.string().min(1).max(500),
});

const usedBodySchema = z
  .object({
    delta: z.union([z.literal(1), z.literal(-1)]).optional(),
    usedCount: z.number().int().min(0).optional(),
  })
  .refine((b) => b.delta !== undefined || b.usedCount !== undefined, {
    message: "Provide delta or usedCount",
  });

const resetTierSchema = z.object({
  tier: z.string().refine(isValidTier, { message: "Invalid tier" }),
});

const allocationSchema = z.object({
  likeId: z.string().min(1),
  count: z.number().int().min(1),
});

const splitBodySchema = z.object({
  allocations: z.array(allocationSchema).min(1),
});

const combineBodySchema = z.object({
  targetLikeId: z.string().min(1),
  allocations: z.array(allocationSchema).min(1),
});

likesRouter.get("/", async (req: AuthedRequest, res) => {
  const tier = req.query.tier as string | undefined;
  if (tier && !isValidTier(tier)) {
    res.status(400).json({ error: "Invalid tier" });
    return;
  }

  const timeZone = safeTimeZone(String(req.headers["x-timezone"] ?? "UTC"));
  const { likes, trackingByTier } = await likesWithTracking(
    req.user!.userId,
    timeZone,
    tier as import("@prisma/client").RewardTier | undefined
  );

  res.json({ likes, trackingByTier });
});

likesRouter.post("/reset-tier", async (req: AuthedRequest, res) => {
  try {
    const body = resetTierSchema.parse(req.body);
    const timeZone = safeTimeZone(String(req.headers["x-timezone"] ?? "UTC"));
    await resetTierLikeTracking(req.user!.userId, body.tier, timeZone);
    res.json({ ok: true });
  } catch (e) {
    const err = e as Error;
    res.status(400).json({ error: err.message });
  }
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

likesRouter.post("/combine", async (req: AuthedRequest, res) => {
  try {
    const body = combineBodySchema.parse(req.body);
    const timeZone = safeTimeZone(String(req.headers["x-timezone"] ?? "UTC"));
    await combineLikeCredits(
      req.user!.userId,
      body.targetLikeId,
      body.allocations,
      timeZone
    );
    res.json({ ok: true });
  } catch (e) {
    const err = e as Error & { status?: number };
    res.status(err.status ?? 400).json({ error: err.message });
  }
});

likesRouter.post("/:id/split", async (req: AuthedRequest, res) => {
  try {
    const likeId = String(req.params.id);
    const body = splitBodySchema.parse(req.body);
    const timeZone = safeTimeZone(String(req.headers["x-timezone"] ?? "UTC"));
    await splitLikeCredit(req.user!.userId, likeId, body.allocations, timeZone);
    res.json({ ok: true });
  } catch (e) {
    const err = e as Error & { status?: number };
    res.status(err.status ?? 400).json({ error: err.message });
  }
});

likesRouter.patch("/:id/used", async (req: AuthedRequest, res) => {
  try {
    const likeId = String(req.params.id);
    const body = usedBodySchema.parse(req.body);
    const timeZone = safeTimeZone(String(req.headers["x-timezone"] ?? "UTC"));
    const result = await adjustLikeUsedCount(
      req.user!.userId,
      likeId,
      timeZone,
      body.delta,
      body.usedCount
    );
    res.json(result);
  } catch (e) {
    const err = e as Error & { status?: number };
    res.status(err.status ?? 400).json({ error: err.message });
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
