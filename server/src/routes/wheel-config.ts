import { Prisma, RewardTier } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { isValidTier } from "../domain/tiers.js";
import {
  normalizeWheelConfig,
  parseSliceCounts,
  toWheelConfigResponse,
  validateWheelConfig,
} from "../domain/wheel.js";

export const wheelConfigRouter = Router();
wheelConfigRouter.use(requireAuth);

const saveSchema = z.object({
  multiplier: z.number().int().min(1).max(24),
  sliceCounts: z.record(z.string(), z.number().int().min(0)),
});

wheelConfigRouter.get("/:tier", async (req: AuthedRequest, res) => {
  const tier = String(req.params.tier);
  if (!isValidTier(tier)) {
    res.status(400).json({ error: "Invalid tier" });
    return;
  }

  const likes = await prisma.userReward.findMany({
    where: { userId: req.user!.userId, tier },
    orderBy: { createdAt: "asc" },
    select: { id: true, label: true },
  });

  const stored = await prisma.tierWheelConfig.findUnique({
    where: { userId_tier: { userId: req.user!.userId, tier } },
  });

  const config = normalizeWheelConfig(
    likes,
    stored
      ? {
          multiplier: stored.multiplier,
          sliceCounts: parseSliceCounts(stored.sliceCounts),
        }
      : null
  );

  res.json(toWheelConfigResponse(tier as RewardTier, likes, config));
});

wheelConfigRouter.put("/:tier", async (req: AuthedRequest, res) => {
  try {
    const tier = String(req.params.tier);
    if (!isValidTier(tier)) {
      res.status(400).json({ error: "Invalid tier" });
      return;
    }

    const body = saveSchema.parse(req.body);
    const likes = await prisma.userReward.findMany({
      where: { userId: req.user!.userId, tier },
      orderBy: { createdAt: "asc" },
      select: { id: true, label: true },
    });

    const validationError = validateWheelConfig(likes, body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const counts: Record<string, number> = {};
    for (const like of likes) {
      counts[like.id] = body.sliceCounts[like.id] ?? 0;
    }

    await prisma.tierWheelConfig.upsert({
      where: { userId_tier: { userId: req.user!.userId, tier } },
      create: {
        userId: req.user!.userId,
        tier,
        multiplier: body.multiplier,
        sliceCounts: counts as unknown as Prisma.InputJsonValue,
      },
      update: {
        multiplier: body.multiplier,
        sliceCounts: counts as unknown as Prisma.InputJsonValue,
      },
    });

    res.json(
      toWheelConfigResponse(tier as RewardTier, likes, {
        multiplier: body.multiplier,
        sliceCounts: counts,
      })
    );
  } catch (e) {
    const err = e as Error;
    res.status(400).json({ error: err.message });
  }
});
