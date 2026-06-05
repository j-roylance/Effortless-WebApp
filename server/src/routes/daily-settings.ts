import { RewardTier } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { parseOptionalTier, tierToOptional } from "../domain/daily.js";
import {
  claimPlanningBonus,
  getDailySettings,
} from "../services/daily-rewards.js";

export const dailySettingsRouter = Router();
dailySettingsRouter.use(requireAuth);

const optionalTierSchema = z
  .union([z.nativeEnum(RewardTier), z.literal("None"), z.null()])
  .optional();

const saveSchema = z.object({
  planningRewardTier: optionalTierSchema,
  allMustsRewardTier: optionalTierSchema,
  allDoDatesRewardTier: optionalTierSchema,
});

function serializeSettings(row: {
  planningRewardTier: RewardTier | null;
  allMustsRewardTier: RewardTier | null;
  allDoDatesRewardTier: RewardTier | null;
}) {
  return {
    planningRewardTier: tierToOptional(row.planningRewardTier),
    allMustsRewardTier: tierToOptional(row.allMustsRewardTier),
    allDoDatesRewardTier: tierToOptional(row.allDoDatesRewardTier),
  };
}

dailySettingsRouter.get("/", async (req: AuthedRequest, res) => {
  const row = await prisma.dailySettings.findUnique({
    where: { userId: req.user!.userId },
  });
  if (!row) {
    res.json({
      planningRewardTier: "None",
      allMustsRewardTier: "None",
      allDoDatesRewardTier: "None",
    });
    return;
  }
  res.json(serializeSettings(row));
});

dailySettingsRouter.put("/", async (req: AuthedRequest, res) => {
  try {
    const body = saveSchema.parse(req.body);
    const data = {
      planningRewardTier: parseOptionalTier(body.planningRewardTier),
      allMustsRewardTier: parseOptionalTier(body.allMustsRewardTier),
      allDoDatesRewardTier: parseOptionalTier(body.allDoDatesRewardTier),
    };

    const row = await prisma.dailySettings.upsert({
      where: { userId: req.user!.userId },
      create: { userId: req.user!.userId, ...data },
      update: data,
    });

    res.json(serializeSettings(row));
  } catch (e) {
    const err = e as Error;
    res.status(400).json({ error: err.message });
  }
});

dailySettingsRouter.post("/claim-planning", async (req: AuthedRequest, res) => {
  try {
    const timeZone = (req.headers["x-timezone"] as string) || "UTC";
    const token = await claimPlanningBonus(req.user!.userId, timeZone);
    res.json({ token });
  } catch (e) {
    const err = e as Error;
    res.status(400).json({ error: err.message });
  }
});
