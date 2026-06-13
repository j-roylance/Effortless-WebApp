/**
 * Spin randomizer: spends a token, rolls outcome, optionally picks a UserLike (UserReward row).
 * Schedule caps use SpinLog + user timezone (X-Timezone header).
 */
import { RewardTier, SpinOutcome, type Prisma } from "@prisma/client";
import {
  TIERS,
  bucketStartForTier,
  canClaimTier,
  tierClaimLimit,
  tierDown,
  tierUp,
} from "../domain/tiers.js";
import { safeTimeZone } from "../domain/daily.js";
import { prisma } from "../lib/prisma.js";
import { getTokenBalances } from "./tokens.js";
import {
  buildWheelSlices,
  parseSliceCounts,
  pickWheelWinner,
} from "../domain/wheel.js";
import {
  DEFAULT_SPIN_OUTCOME_WEIGHTS,
  parseSpinOutcomeWeights,
  rollWeightedOutcome,
} from "../domain/spin-odds.js";

type Tx = Prisma.TransactionClient;

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

function shouldSpinForOutcome(tokenTier: RewardTier, outcome: SpinOutcome): boolean {
  if (outcome === SpinOutcome.Win || outcome === SpinOutcome.LevelUp) return true;
  // Step down spins one tier lower; Bronze has nowhere to go.
  return outcome === SpinOutcome.LevelDown && tokenTier !== RewardTier.Bronze;
}

async function countClaimsInBucket(
  userId: string,
  tier: RewardTier,
  timeZone: string,
  tx: Tx | typeof prisma = prisma
): Promise<number> {
  const now = new Date();
  const bucketStart = bucketStartForTier(tier, now, timeZone);
  return tx.spinLog.count({
    where: {
      userId,
      effectiveTier: tier,
      outcome: { in: [SpinOutcome.Win, SpinOutcome.LevelUp, SpinOutcome.LevelDown] },
      createdAt: { gte: bucketStart },
    },
  });
}

/** Atomically mark the oldest unspent token as spent; returns null if none or lost race. */
async function spendOldestToken(
  tx: Tx,
  userId: string,
  tokenTier: RewardTier
): Promise<{ id: string } | null> {
  const oldest = await tx.rewardToken.findFirst({
    where: { userId, tier: tokenTier, spentAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!oldest) return null;

  const spent = await tx.rewardToken.updateMany({
    where: { id: oldest.id, spentAt: null },
    data: { spentAt: new Date() },
  });
  return spent.count === 1 ? oldest : null;
}

export interface SpinWheelSlice {
  id: string;
  label: string;
  empty: boolean;
}

export interface SpinResult {
  outcome: SpinOutcome;
  effectiveTier: RewardTier;
  like?: { id: string; label: string };
  spinnerLikes: SpinWheelSlice[];
  winningIndex: number;
  tokenBalances: Record<RewardTier, number>;
  scheduleBlocked?: boolean;
}

export async function executeSpin(
  userId: string,
  tokenTier: RewardTier,
  timeZoneInput: string
): Promise<SpinResult> {
  const timeZone = safeTimeZone(timeZoneInput);

  const settingsRow = await prisma.dailySettings.findUnique({
    where: { userId },
    select: { spinOutcomeWeights: true },
  });
  const outcomeWeights = parseSpinOutcomeWeights(
    settingsRow?.spinOutcomeWeights ?? DEFAULT_SPIN_OUTCOME_WEIGHTS
  );

  const spinCore = await prisma.$transaction(async (tx) => {
    const claimCount = await countClaimsInBucket(userId, tokenTier, timeZone, tx);
    if (!canClaimTier(tokenTier, claimCount)) {
      const err = Object.assign(
        new Error(
          `Schedule cap reached for ${tokenTier} (${tierClaimLimit(tokenTier)} per period)`
        ),
        { status: 409, code: "schedule_cap" }
      );
      throw err;
    }

    const token = await spendOldestToken(tx, userId, tokenTier);
    if (!token) {
      throw Object.assign(new Error("No unspent token for this tier"), { status: 400 });
    }

    let outcome = rollWeightedOutcome(outcomeWeights);
    let effectiveTier = effectiveTierForOutcome(tokenTier, outcome);

    if (shouldSpinForOutcome(tokenTier, outcome)) {
      const effectiveClaims = await countClaimsInBucket(userId, effectiveTier, timeZone, tx);
      if (!canClaimTier(effectiveTier, effectiveClaims)) {
        outcome = SpinOutcome.NoReward;
        effectiveTier = tokenTier;
      }
    }

    let reward: { id: string; label: string } | undefined;
    let spinnerRewards: SpinWheelSlice[] = [];
    let winningIndex = 0;

    const pickPrize = shouldSpinForOutcome(tokenTier, outcome);

    if (pickPrize) {
      const pool = await tx.userReward.findMany({
        where: { userId, tier: effectiveTier },
        orderBy: { createdAt: "asc" },
      });

      if (pool.length === 0) {
        outcome = SpinOutcome.NoReward;
      } else {
        const wheelConfig = await tx.tierWheelConfig.findUnique({
          where: { userId_tier: { userId, tier: effectiveTier } },
        });

        const slices = buildWheelSlices(
          pool.map((r) => ({ id: r.id, label: r.label })),
          wheelConfig
            ? {
                multiplier: wheelConfig.multiplier,
                sliceCounts: parseSliceCounts(wheelConfig.sliceCounts),
              }
            : null
        );

        spinnerRewards = slices.map((s) => ({
          id: s.id,
          label: s.label,
          empty: s.empty,
        }));

        const picked = pickWheelWinner(slices);
        winningIndex = picked.winningIndex;
        reward = picked.like;
      }
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

    return {
      outcome,
      effectiveTier,
      like: reward,
      spinnerLikes: spinnerRewards,
      winningIndex,
    };
  });

  const tokenBalances = await getTokenBalances(userId);

  return {
    ...spinCore,
    tokenBalances,
  };
}

export async function getScheduleStatus(userId: string, timeZoneInput: string) {
  const timeZone = safeTimeZone(timeZoneInput);
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
