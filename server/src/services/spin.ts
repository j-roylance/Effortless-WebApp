/**
 * Spin randomizer: spends a token, rolls outcome, optionally picks a UserLike (UserReward row).
 * Schedule caps use SpinLog + user timezone (X-Timezone header).
 */
import { RewardTier, SpinOutcome } from "@prisma/client";
import {
  TIERS,
  bucketStartForTier,
  canClaimTier,
  tierClaimLimit,
  tierDown,
  tierUp,
} from "../domain/tiers.js";
import { prisma } from "../lib/prisma.js";
import { getTokenBalances } from "./tokens.js";

const OUTCOMES: SpinOutcome[] = [
  SpinOutcome.Win,
  SpinOutcome.LevelUp,
  SpinOutcome.NoReward,
  SpinOutcome.LevelDown,
];

function rollOutcome(): SpinOutcome {
  return OUTCOMES[Math.floor(Math.random() * OUTCOMES.length)]!;
}

function effectiveTierForOutcome(tokenTier: RewardTier, outcome: SpinOutcome): RewardTier {
  switch (outcome) {
    case SpinOutcome.Win:
      return tokenTier;
    case SpinOutcome.LevelUp:
      return tierUp(tokenTier);
    case SpinOutcome.LevelDown:
      return tierDown(tokenTier);
    default:
      return tokenTier;
  }
}

async function countClaimsInBucket(
  userId: string,
  tier: RewardTier,
  timeZone: string
): Promise<number> {
  const now = new Date();
  const bucketStart = bucketStartForTier(tier, now, timeZone);
  return prisma.spinLog.count({
    where: {
      userId,
      effectiveTier: tier,
      outcome: { in: [SpinOutcome.Win, SpinOutcome.LevelUp] },
      createdAt: { gte: bucketStart },
    },
  });
}

export interface SpinResult {
  outcome: SpinOutcome;
  effectiveTier: RewardTier;
  like?: { id: string; label: string };
  spinnerLikes: { id: string; label: string }[];
  winningIndex: number;
  tokenBalances: Record<RewardTier, number>;
  newTokenFromLevelUp: boolean;
  scheduleBlocked?: boolean;
}

export async function executeSpin(
  userId: string,
  tokenTier: RewardTier,
  timeZone: string
): Promise<SpinResult> {
  const claimCount = await countClaimsInBucket(userId, tokenTier, timeZone);
  if (!canClaimTier(tokenTier, claimCount)) {
    const err = Object.assign(
      new Error(
        `Schedule cap reached for ${tokenTier} (${tierClaimLimit(tokenTier)} per period)`
      ),
      { status: 409, code: "schedule_cap" }
    );
    throw err;
  }

  return prisma.$transaction(async (tx) => {
    const token = await tx.rewardToken.findFirst({
      where: { userId, tier: tokenTier, spentAt: null },
      orderBy: { createdAt: "asc" },
    });

    if (!token) {
      throw Object.assign(new Error("No unspent token for this tier"), { status: 400 });
    }

    await tx.rewardToken.update({
      where: { id: token.id },
      data: { spentAt: new Date() },
    });

    let outcome = rollOutcome();
    let effectiveTier = effectiveTierForOutcome(tokenTier, outcome);

    const shouldPickPrize = outcome === SpinOutcome.Win || outcome === SpinOutcome.LevelUp;

    if (shouldPickPrize) {
      const effectiveClaims = await tx.spinLog.count({
        where: {
          userId,
          effectiveTier,
          outcome: { in: [SpinOutcome.Win, SpinOutcome.LevelUp] },
          createdAt: { gte: bucketStartForTier(effectiveTier, new Date(), timeZone) },
        },
      });

      if (!canClaimTier(effectiveTier, effectiveClaims)) {
        outcome = SpinOutcome.NoReward;
        effectiveTier = tokenTier;
      }
    }

    let reward: { id: string; label: string } | undefined;
    let spinnerRewards: { id: string; label: string }[] = [];
    let winningIndex = 0;
    let newTokenFromLevelUp = false;

    const pickPrize =
      outcome === SpinOutcome.Win || outcome === SpinOutcome.LevelUp;

    if (pickPrize) {
      const pool = await tx.userReward.findMany({
        where: { userId, tier: effectiveTier },
        orderBy: { createdAt: "asc" },
      });

      spinnerRewards = pool.map((r) => ({ id: r.id, label: r.label }));

      if (pool.length === 0) {
        outcome = SpinOutcome.NoReward;
      } else {
        winningIndex = Math.floor(Math.random() * pool.length);
        const picked = pool[winningIndex]!;
        reward = { id: picked.id, label: picked.label };
      }
    }

    if (outcome === SpinOutcome.LevelUp) {
      await tx.rewardToken.create({
        data: {
          userId,
          tier: effectiveTier,
          source: "spin_level_up",
        },
      });
      newTokenFromLevelUp = true;
    }

    await tx.spinLog.create({
      data: {
        userId,
        tokenTier,
        outcome,
        effectiveTier,
        rewardId: reward?.id ?? null,
      },
    });

    const tokenBalances = await getTokenBalances(userId);

    return {
      outcome,
      effectiveTier,
      like: reward,
      spinnerLikes: spinnerRewards,
      winningIndex,
      tokenBalances,
      newTokenFromLevelUp,
    };
  });
}

export async function getScheduleStatus(userId: string, timeZone: string) {
  const status: Record<
    RewardTier,
    { claimCount: number; limit: number; canClaim: boolean }
  > = {} as never;

  for (const tier of TIERS) {
    const claimCount = await countClaimsInBucket(userId, tier, timeZone);
    const limit = tierClaimLimit(tier);
    status[tier] = {
      claimCount,
      limit,
      canClaim: canClaimTier(tier, claimCount),
    };
  }
  return status;
}
