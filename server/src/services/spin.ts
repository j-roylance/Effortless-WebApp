/**
 * Spin randomizer: spends a token, rolls outcome, optionally picks a UserLike (UserReward row).
 * Schedule caps are tracked for the Likes UI (GET /tokens schedule); spins are not blocked server-side.
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
import { logSpinLikeWin } from "./like-tracking.js";
import {
  buildWheelSlices,
  parseSliceCounts,
  pickWheelWinner,
} from "../domain/wheel.js";
import {
  DEFAULT_SPIN_OUTCOME_WEIGHTS,
  parseSpinOutcomeWeights,
  rollWeightedOutcome,
  type SpinOutcomeWeights,
} from "../domain/spin-odds.js";
import {
  applyPityToWeights,
  countConsecutivePityLosses,
  effectiveWeightsForTier,
} from "../domain/spin-pity.js";

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
}

export interface SpinPityStatus {
  consecutiveLosses: number;
  effectiveWeights: SpinOutcomeWeights;
}

async function getBaseSpinWeights(userId: string): Promise<SpinOutcomeWeights> {
  const settingsRow = await prisma.dailySettings.findUnique({
    where: { userId },
    select: { spinOutcomeWeights: true },
  });
  return parseSpinOutcomeWeights(
    settingsRow?.spinOutcomeWeights ?? DEFAULT_SPIN_OUTCOME_WEIGHTS
  );
}

async function recentSpinsForTier(
  userId: string,
  tokenTier: RewardTier,
  tx: Tx | typeof prisma = prisma
) {
  return tx.spinLog.findMany({
    where: { userId, tokenTier },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { outcome: true },
  });
}

export async function getPityStatusForTier(
  userId: string,
  tokenTier: RewardTier,
  baseWeights?: SpinOutcomeWeights
): Promise<SpinPityStatus> {
  const base = baseWeights ?? (await getBaseSpinWeights(userId));
  const recent = await recentSpinsForTier(userId, tokenTier);
  return effectiveWeightsForTier(base, tokenTier, recent);
}

export async function getPityStatusByTier(
  userId: string
): Promise<Record<RewardTier, SpinPityStatus>> {
  const base = await getBaseSpinWeights(userId);
  const status = {} as Record<RewardTier, SpinPityStatus>;

  await Promise.all(
    TIERS.map(async (tier) => {
      status[tier] = await getPityStatusForTier(userId, tier, base);
    })
  );

  return status;
}

export async function executeSpin(
  userId: string,
  tokenTier: RewardTier,
  timeZoneInput: string
): Promise<SpinResult> {
  const timeZone = safeTimeZone(timeZoneInput);

  const outcomeWeights = await getBaseSpinWeights(userId);

  const spinCore = await prisma.$transaction(async (tx) => {
    const token = await spendOldestToken(tx, userId, tokenTier);
    if (!token) {
      throw Object.assign(new Error("No unspent token for this tier"), { status: 400 });
    }

    const recent = await recentSpinsForTier(userId, tokenTier, tx);
    const consecutiveLosses = countConsecutivePityLosses(recent, tokenTier);
    const rollWeights = applyPityToWeights(outcomeWeights, consecutiveLosses);

    let outcome = rollWeightedOutcome(rollWeights);
    let effectiveTier = effectiveTierForOutcome(tokenTier, outcome);

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
        effectiveTier = tokenTier;
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

    const spinLog = await tx.spinLog.create({
      data: {
        userId,
        tokenTier,
        outcome,
        effectiveTier,
        rewardId: reward?.id ?? null,
      },
    });

    if (reward?.id) {
      await logSpinLikeWin(
        tx,
        userId,
        reward.id,
        effectiveTier,
        spinLog.id,
        timeZone,
        spinLog.createdAt
      );
    }

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
