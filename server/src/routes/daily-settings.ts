import { Router } from "express";
import type { Prisma } from "@prisma/client";
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
  parseSpinOutcomeWeights,
  spinOutcomeWeightsToJson,
  validateSpinOutcomeWeights,
} from "../domain/spin-odds.js";
import {
  parseSpinPitySettings,
  spinPitySettingsToJson,
  syncPityLevelUp,
  validateSpinPitySettings,
  type SpinPitySettings,
} from "../domain/spin-pity.js";
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

const spinOutcomeWeightsSchema = z.object({
  win: z.number().int().min(0).max(100),
  levelUp: z.number().int().min(0).max(100),
  noReward: z.number().int().min(0).max(100),
  levelDown: z.number().int().min(0).max(100),
});

const saveSchema = z.object({
  planningReward: milestoneRewardSchema.optional(),
  allMustsReward: milestoneRewardSchema.optional(),
  allDoDatesReward: milestoneRewardSchema.optional(),
  spinOutcomeWeights: spinOutcomeWeightsSchema.optional(),
  spinPitySettings: z
    .object({
      enabled: z.boolean(),
      oneLoss: spinOutcomeWeightsSchema,
      maxLoss: spinOutcomeWeightsSchema,
    })
    .optional(),
});

function serializeSettings(row: {
  planningReward: unknown;
  allMustsReward: unknown;
  allDoDatesReward: unknown;
  spinOutcomeWeights: unknown;
  spinPitySettings: unknown;
}) {
  const spinOutcomeWeights = parseSpinOutcomeWeights(row.spinOutcomeWeights);
  return {
    planningReward: parseMilestoneReward(row.planningReward),
    allMustsReward: parseMilestoneReward(row.allMustsReward),
    allDoDatesReward: parseMilestoneReward(row.allDoDatesReward),
    spinOutcomeWeights,
    spinPitySettings: syncPityLevelUp(
      spinOutcomeWeights,
      parseSpinPitySettings(row.spinPitySettings, spinOutcomeWeights)
    ),
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
    const spinOutcomeWeights = parseSpinOutcomeWeights(null);
    res.json({
      planningReward: { kind: "none" },
      allMustsReward: { kind: "none" },
      allDoDatesReward: { kind: "none" },
      spinOutcomeWeights,
      spinPitySettings: parseSpinPitySettings(null, spinOutcomeWeights),
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
    const spinOutcomeWeights = body.spinOutcomeWeights
      ? parseSpinOutcomeWeights(body.spinOutcomeWeights)
      : undefined;

    const existingRow = await prisma.dailySettings.findUnique({
      where: { userId },
      select: { spinOutcomeWeights: true, spinPitySettings: true },
    });
    const resolvedBase =
      spinOutcomeWeights ??
      parseSpinOutcomeWeights(existingRow?.spinOutcomeWeights ?? null);

    let spinPitySettings: SpinPitySettings | undefined = body.spinPitySettings
      ? parseSpinPitySettings(body.spinPitySettings, resolvedBase)
      : existingRow
        ? parseSpinPitySettings(existingRow.spinPitySettings, resolvedBase)
        : parseSpinPitySettings(null, resolvedBase);

    spinPitySettings = syncPityLevelUp(resolvedBase, spinPitySettings);

    if (spinOutcomeWeights) {
      const oddsErr = validateSpinOutcomeWeights(spinOutcomeWeights);
      if (oddsErr) {
        res.status(400).json({ error: oddsErr });
        return;
      }
    }

    if (body.spinPitySettings || spinOutcomeWeights) {
      const pityErr = validateSpinPitySettings(resolvedBase, spinPitySettings);
      if (pityErr) {
        res.status(400).json({ error: pityErr });
        return;
      }
    }

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
      spinOutcomeWeights?: Prisma.InputJsonValue;
      spinPitySettings?: Prisma.InputJsonValue;
    } = {};

    if (planningReward) data.planningReward = milestoneRewardToJson(planningReward);
    if (allMustsReward) data.allMustsReward = milestoneRewardToJson(allMustsReward);
    if (allDoDatesReward) data.allDoDatesReward = milestoneRewardToJson(allDoDatesReward);
    if (spinOutcomeWeights) {
      const json = spinOutcomeWeightsToJson(spinOutcomeWeights);
      data.spinOutcomeWeights = json as unknown as Prisma.InputJsonValue;
    }
    if (body.spinPitySettings || spinOutcomeWeights) {
      const json = spinPitySettingsToJson(spinPitySettings);
      data.spinPitySettings = json as unknown as Prisma.InputJsonValue;
    }

    const row = await prisma.dailySettings.upsert({
      where: { userId },
      create: {
        userId,
        planningReward: milestoneRewardToJson(planningReward ?? { kind: "none" }),
        allMustsReward: milestoneRewardToJson(allMustsReward ?? { kind: "none" }),
        allDoDatesReward: milestoneRewardToJson(allDoDatesReward ?? { kind: "none" }),
        spinPitySettings: spinPitySettingsToJson(
          spinPitySettings
        ) as unknown as Prisma.InputJsonValue,
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
