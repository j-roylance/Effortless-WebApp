import { RewardTier } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { isValidTier } from "../domain/tiers.js";
import { safeTimeZone } from "../domain/daily.js";
import {
  milestoneRewardToJson,
  parseMilestoneReward,
  type MilestoneReward,
} from "../domain/rewards.js";
import {
  claimPlanningBonus,
} from "../services/daily-rewards.js";

export const dailySettingsRouter = Router();
dailySettingsRouter.use(requireAuth);

const milestoneRewardSchema = z.union([
  z.object({ kind: z.literal("none") }),
  z.object({
    kind: z.literal("token"),
    tier: z.string().refine(isValidTier, { message: "Invalid tier" }),
  }),
  z.object({
    kind: z.literal("like"),
    likeId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("custom"),
    label: z.string().min(1).max(200),
  }),
]);

const saveSchema = z.object({
  planningReward: milestoneRewardSchema.optional(),
  allMustsReward: milestoneRewardSchema.optional(),
  allDoDatesReward: milestoneRewardSchema.optional(),
});

function serializeSettings(row: {
  planningReward: unknown;
  allMustsReward: unknown;
  allDoDatesReward: unknown;
}) {
  return {
    planningReward: parseMilestoneReward(row.planningReward),
    allMustsReward: parseMilestoneReward(row.allMustsReward),
    allDoDatesReward: parseMilestoneReward(row.allDoDatesReward),
  };
}

async function validateMilestoneReward(
  userId: string,
  reward: MilestoneReward
): Promise<string | null> {
  if (reward.kind !== "like") return null;
  const like = await prisma.userReward.findFirst({
    where: { id: reward.likeId, userId },
  });
  if (!like) return "Selected like not found";
  return null;
}

dailySettingsRouter.get("/", async (req: AuthedRequest, res) => {
  const row = await prisma.dailySettings.findUnique({
    where: { userId: req.user!.userId },
  });
  if (!row) {
    res.json({
      planningReward: { kind: "none" },
      allMustsReward: { kind: "none" },
      allDoDatesReward: { kind: "none" },
    });
    return;
  }
  res.json(serializeSettings(row));
});

dailySettingsRouter.put("/", async (req: AuthedRequest, res) => {
  try {
    const body = saveSchema.parse(req.body);
    const userId = req.user!.userId;

    const planningReward = body.planningReward
      ? parseMilestoneReward(body.planningReward)
      : undefined;
    const allMustsReward = body.allMustsReward
      ? parseMilestoneReward(body.allMustsReward)
      : undefined;
    const allDoDatesReward = body.allDoDatesReward
      ? parseMilestoneReward(body.allDoDatesReward)
      : undefined;

    for (const reward of [planningReward, allMustsReward, allDoDatesReward]) {
      if (!reward) continue;
      const err = await validateMilestoneReward(userId, reward);
      if (err) {
        res.status(400).json({ error: err });
        return;
      }
    }

    const data: {
      planningReward?: ReturnType<typeof milestoneRewardToJson>;
      allMustsReward?: ReturnType<typeof milestoneRewardToJson>;
      allDoDatesReward?: ReturnType<typeof milestoneRewardToJson>;
    } = {};

    if (planningReward) data.planningReward = milestoneRewardToJson(planningReward);
    if (allMustsReward) data.allMustsReward = milestoneRewardToJson(allMustsReward);
    if (allDoDatesReward) data.allDoDatesReward = milestoneRewardToJson(allDoDatesReward);

    const row = await prisma.dailySettings.upsert({
      where: { userId },
      create: {
        userId,
        planningReward: milestoneRewardToJson(planningReward ?? { kind: "none" }),
        allMustsReward: milestoneRewardToJson(allMustsReward ?? { kind: "none" }),
        allDoDatesReward: milestoneRewardToJson(allDoDatesReward ?? { kind: "none" }),
      },
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
    const timeZone = safeTimeZone(req.headers["x-timezone"] as string);
    const result = await claimPlanningBonus(req.user!.userId, timeZone);
    res.json({
      token: result?.token ?? null,
      definiteReward: result?.definiteReward ?? null,
    });
  } catch (e) {
    const err = e as Error;
    res.status(400).json({ error: err.message });
  }
});
