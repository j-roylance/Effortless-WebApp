import type { RewardTier, UserReward } from "@prisma/client";
import { SpinOutcome } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { safeTimeZone } from "../domain/daily.js";
import {
  canCombineToTier,
  canSplitFromTier,
  conversionCount,
  lowerTierFor,
} from "../domain/like-conversions.js";
import {
  TIERS,
  TIER_FREQUENCY_LABEL,
  bucketKeyForTier,
  bucketStartForTier,
  tierUp,
} from "../domain/tiers.js";
import { prisma } from "../lib/prisma.js";

type Tx = Prisma.TransactionClient;

export interface LikeTrackingMeta {
  bucketKey: string;
  periodLabel: string;
}

export interface LikeWithTracking {
  id: string;
  userId: string;
  tier: RewardTier;
  label: string;
  createdAt: string;
  rewardedCount: number;
  awardedCount: number;
  usedCount: number;
  ledgerDelta: number;
  availableCount: number;
}

export interface LikeAllocation {
  likeId: string;
  count: number;
}

async function effectiveStartForTier(
  userId: string,
  tier: RewardTier,
  bucketKey: string,
  timeZone: string,
  now: Date,
  tx: Tx = prisma
): Promise<Date> {
  const periodStart = bucketStartForTier(tier, now, timeZone);
  const reset = await tx.tierLikeReset.findUnique({
    where: { userId_tier_bucketKey: { userId, tier, bucketKey } },
  });
  if (!reset) return periodStart;
  return reset.resetAt > periodStart ? reset.resetAt : periodStart;
}

async function rewardedCountForLike(
  userId: string,
  likeId: string,
  tier: RewardTier,
  effectiveStart: Date,
  tx: Tx = prisma
): Promise<number> {
  const prizeOutcomes: SpinOutcome[] = [
    SpinOutcome.Win,
    SpinOutcome.LevelUp,
    SpinOutcome.LevelDown,
  ];
  const [spinCount, grantCount] = await Promise.all([
    tx.spinLog.count({
      where: {
        userId,
        rewardId: likeId,
        effectiveTier: tier,
        outcome: { in: prizeOutcomes },
        createdAt: { gte: effectiveStart },
      },
    }),
    tx.likeGrantLog.count({
      where: {
        userId,
        likeId,
        createdAt: { gte: effectiveStart },
      },
    }),
  ]);
  return spinCount + grantCount;
}

async function ledgerCreditsForLike(
  userId: string,
  likeId: string,
  bucketKey: string,
  tx: Tx = prisma
): Promise<number> {
  const result = await tx.likeCreditLedger.aggregate({
    where: { userId, likeId, bucketKey, delta: { gt: 0 } },
    _sum: { delta: true },
  });
  return result._sum.delta ?? 0;
}

async function ledgerDeltaForLike(
  userId: string,
  likeId: string,
  bucketKey: string,
  tx: Tx = prisma
): Promise<number> {
  const result = await tx.likeCreditLedger.aggregate({
    where: { userId, likeId, bucketKey },
    _sum: { delta: true },
  });
  return result._sum.delta ?? 0;
}

async function availableForLike(
  userId: string,
  like: UserReward,
  bucketKey: string,
  timeZone: string,
  now: Date,
  usedByLikeId: Map<string, number>,
  ledgerByLikeId: Map<string, number>,
  ledgerCreditsByLikeId: Map<string, number>,
  tx: Tx = prisma
): Promise<{
  rewardedCount: number;
  awardedCount: number;
  usedCount: number;
  ledgerDelta: number;
  availableCount: number;
}> {
  const effectiveStart = await effectiveStartForTier(
    userId,
    like.tier,
    bucketKey,
    timeZone,
    now,
    tx
  );
  const rewardedCount = await rewardedCountForLike(
    userId,
    like.id,
    like.tier,
    effectiveStart,
    tx
  );
  const usedCount = usedByLikeId.get(`${like.id}:${bucketKey}`) ?? 0;
  const ledgerDelta =
    ledgerByLikeId.get(`${like.id}:${bucketKey}`) ??
    (await ledgerDeltaForLike(userId, like.id, bucketKey, tx));
  const ledgerCredits =
    ledgerCreditsByLikeId.get(`${like.id}:${bucketKey}`) ??
    (await ledgerCreditsForLike(userId, like.id, bucketKey, tx));
  const awardedCount = rewardedCount + ledgerCredits;
  const availableCount = rewardedCount - usedCount + ledgerDelta;
  return { rewardedCount, awardedCount, usedCount, ledgerDelta, availableCount };
}

export function trackingMetaForTiers(timeZoneInput: string): Record<RewardTier, LikeTrackingMeta> {
  const timeZone = safeTimeZone(timeZoneInput);
  const now = new Date();
  const meta = {} as Record<RewardTier, LikeTrackingMeta>;
  for (const tier of TIERS) {
    meta[tier] = {
      bucketKey: bucketKeyForTier(tier, timeZone, now),
      periodLabel: TIER_FREQUENCY_LABEL[tier],
    };
  }
  return meta;
}

export async function likesWithTracking(
  userId: string,
  timeZoneInput: string,
  tierFilter?: RewardTier
): Promise<{
  likes: LikeWithTracking[];
  trackingByTier: Record<RewardTier, LikeTrackingMeta>;
}> {
  const timeZone = safeTimeZone(timeZoneInput);
  const now = new Date();
  const trackingByTier = trackingMetaForTiers(timeZoneInput);

  const where: { userId: string; tier?: RewardTier } = { userId };
  if (tierFilter) where.tier = tierFilter;

  const likes = await prisma.userReward.findMany({
    where,
    orderBy: [{ tier: "asc" }, { createdAt: "asc" }],
  });

  const usedRows = await prisma.likeUsedCount.findMany({
    where: {
      userId,
      OR: TIERS.map((tier) => ({
        bucketKey: trackingByTier[tier].bucketKey,
        like: { tier },
      })),
    },
  });

  const usedByLikeId = new Map(
    usedRows.map((row) => [`${row.likeId}:${row.bucketKey}`, row.usedCount])
  );

  const ledgerRows = await prisma.likeCreditLedger.groupBy({
    by: ["likeId", "bucketKey"],
    where: {
      userId,
      OR: TIERS.map((tier) => ({
        bucketKey: trackingByTier[tier].bucketKey,
        like: { tier },
      })),
    },
    _sum: { delta: true },
  });

  const ledgerByLikeId = new Map(
    ledgerRows.map((row) => [`${row.likeId}:${row.bucketKey}`, row._sum.delta ?? 0])
  );

  const ledgerCreditRows = await prisma.likeCreditLedger.groupBy({
    by: ["likeId", "bucketKey"],
    where: {
      userId,
      delta: { gt: 0 },
      OR: TIERS.map((tier) => ({
        bucketKey: trackingByTier[tier].bucketKey,
        like: { tier },
      })),
    },
    _sum: { delta: true },
  });

  const ledgerCreditsByLikeId = new Map(
    ledgerCreditRows.map((row) => [`${row.likeId}:${row.bucketKey}`, row._sum.delta ?? 0])
  );

  const result: LikeWithTracking[] = [];

  for (const like of likes) {
    const bucketKey = trackingByTier[like.tier].bucketKey;
    const { rewardedCount, awardedCount, usedCount, ledgerDelta, availableCount } =
      await availableForLike(
      userId,
      like,
      bucketKey,
      timeZone,
      now,
      usedByLikeId,
      ledgerByLikeId,
      ledgerCreditsByLikeId
    );

    result.push({
      id: like.id,
      userId: like.userId,
      tier: like.tier,
      label: like.label,
      createdAt: like.createdAt.toISOString(),
      rewardedCount,
      awardedCount,
      usedCount,
      ledgerDelta,
      availableCount,
    });
  }

  return { likes: result, trackingByTier };
}

export async function logLikeGrant(
  tx: Tx,
  userId: string,
  likeId: string,
  tier: RewardTier,
  source: string
): Promise<void> {
  await tx.likeGrantLog.create({
    data: { userId, likeId, tier, source },
  });
}

export async function adjustLikeUsedCount(
  userId: string,
  likeId: string,
  timeZoneInput: string,
  delta?: number,
  usedCount?: number
): Promise<{ usedCount: number }> {
  const timeZone = safeTimeZone(timeZoneInput);
  const like = await prisma.userReward.findFirst({
    where: { id: likeId, userId },
  });
  if (!like) throw Object.assign(new Error("Not found"), { status: 404 });

  const bucketKey = bucketKeyForTier(like.tier, timeZone);
  const existing = await prisma.likeUsedCount.findUnique({
    where: { userId_likeId_bucketKey: { userId, likeId, bucketKey } },
  });
  const current = existing?.usedCount ?? 0;

  let next: number;
  if (usedCount !== undefined) {
    next = Math.max(0, Math.floor(usedCount));
  } else if (delta !== undefined) {
    next = Math.max(0, current + delta);
  } else {
    throw new Error("Provide delta or usedCount");
  }

  const row = await prisma.likeUsedCount.upsert({
    where: { userId_likeId_bucketKey: { userId, likeId, bucketKey } },
    create: { userId, likeId, bucketKey, usedCount: next },
    update: { usedCount: next },
  });

  return { usedCount: row.usedCount };
}

function validateAllocations(
  allocations: LikeAllocation[],
  requiredTotal: number
): LikeAllocation[] {
  if (!Array.isArray(allocations) || allocations.length === 0) {
    throw new Error("Provide at least one allocation");
  }

  const normalized: LikeAllocation[] = [];
  let total = 0;

  for (const entry of allocations) {
    const count = Math.floor(entry.count);
    if (!entry.likeId || count <= 0) continue;
    total += count;
    normalized.push({ likeId: entry.likeId, count });
  }

  if (total !== requiredTotal) {
    throw new Error(`Allocations must sum to ${requiredTotal}`);
  }

  return normalized;
}

async function deletePairedLedgerLegs(
  tx: Tx,
  userId: string,
  tier: RewardTier,
  bucketKey: string,
  likeIds: string[],
  timeZone: string
): Promise<void> {
  const rowsToDelete = await tx.likeCreditLedger.findMany({
    where: { userId, bucketKey, likeId: { in: likeIds } },
  });
  if (rowsToDelete.length === 0) return;

  const lowerTier = lowerTierFor(tier);
  const lowerBucketKey = bucketKeyForTier(lowerTier, timeZone);
  const upperTier = tierUp(tier);
  const upperBucketKey = bucketKeyForTier(upperTier, timeZone);

  const pairedFilters: Prisma.LikeCreditLedgerWhereInput[] = [];

  for (const row of rowsToDelete) {
    if (row.kind === "split" && row.delta < 0) {
      pairedFilters.push({
        userId,
        bucketKey: lowerBucketKey,
        kind: "split",
        delta: { gt: 0 },
        createdAt: row.createdAt,
      });
    } else if (row.kind === "split" && row.delta > 0) {
      pairedFilters.push({
        userId,
        bucketKey: upperBucketKey,
        kind: "split",
        delta: { lt: 0 },
        createdAt: row.createdAt,
      });
    } else if (row.kind === "combine" && row.delta < 0) {
      pairedFilters.push({
        userId,
        bucketKey: upperBucketKey,
        kind: "combine",
        delta: { gt: 0 },
        createdAt: row.createdAt,
      });
    } else if (row.kind === "combine" && row.delta > 0) {
      pairedFilters.push({
        userId,
        bucketKey: lowerBucketKey,
        kind: "combine",
        delta: { lt: 0 },
        createdAt: row.createdAt,
      });
    }
  }

  if (pairedFilters.length > 0) {
    await tx.likeCreditLedger.deleteMany({ where: { OR: pairedFilters } });
  }
}

export async function splitLikeCredit(
  userId: string,
  sourceLikeId: string,
  allocations: LikeAllocation[],
  timeZoneInput: string
): Promise<void> {
  const timeZone = safeTimeZone(timeZoneInput);
  const now = new Date();

  const source = await prisma.userReward.findFirst({
    where: { id: sourceLikeId, userId },
  });
  if (!source) throw Object.assign(new Error("Not found"), { status: 404 });
  if (!canSplitFromTier(source.tier)) {
    throw new Error(`Cannot split ${source.tier} likes`);
  }

  const yieldCount = conversionCount(source.tier);
  const lowerTier = lowerTierFor(source.tier);
  const normalized = validateAllocations(allocations, yieldCount);

  const sourceBucketKey = bucketKeyForTier(source.tier, timeZone, now);
  const lowerBucketKey = bucketKeyForTier(lowerTier, timeZone, now);

  const targetIds = [...new Set(normalized.map((a) => a.likeId))];
  const targets = await prisma.userReward.findMany({
    where: { userId, id: { in: targetIds } },
  });
  if (targets.length !== targetIds.length) {
    throw new Error("Invalid allocation like");
  }
  for (const target of targets) {
    if (target.tier !== lowerTier) {
      throw new Error(`Allocations must be ${lowerTier} likes`);
    }
  }

  await prisma.$transaction(async (tx) => {
    const sourceAvailable = await availableForLike(
      userId,
      source,
      sourceBucketKey,
      timeZone,
      now,
      new Map(),
      new Map(),
      new Map(),
      tx
    );
    if (sourceAvailable.availableCount < 1) {
      throw new Error("Not enough available credits to split");
    }

    await tx.likeCreditLedger.create({
      data: {
        userId,
        likeId: source.id,
        bucketKey: sourceBucketKey,
        delta: -1,
        kind: "split",
      },
    });

    for (const { likeId, count } of normalized) {
      await tx.likeCreditLedger.create({
        data: {
          userId,
          likeId,
          bucketKey: lowerBucketKey,
          delta: count,
          kind: "split",
        },
      });
    }
  });
}

export async function combineLikeCredits(
  userId: string,
  targetLikeId: string,
  allocations: LikeAllocation[],
  timeZoneInput: string
): Promise<void> {
  const timeZone = safeTimeZone(timeZoneInput);
  const now = new Date();

  const target = await prisma.userReward.findFirst({
    where: { id: targetLikeId, userId },
  });
  if (!target) throw Object.assign(new Error("Not found"), { status: 404 });
  if (!canCombineToTier(target.tier)) {
    throw new Error(`Cannot combine into ${target.tier}`);
  }

  const cost = conversionCount(target.tier);
  const lowerTier = lowerTierFor(target.tier);
  const normalized = validateAllocations(allocations, cost);

  const targetBucketKey = bucketKeyForTier(target.tier, timeZone, now);
  const lowerBucketKey = bucketKeyForTier(lowerTier, timeZone, now);

  const sourceIds = [...new Set(normalized.map((a) => a.likeId))];
  const sources = await prisma.userReward.findMany({
    where: { userId, id: { in: sourceIds } },
  });
  if (sources.length !== sourceIds.length) {
    throw new Error("Invalid allocation like");
  }

  const sourceById = new Map(sources.map((s) => [s.id, s]));
  for (const source of sources) {
    if (source.tier !== lowerTier) {
      throw new Error(`Allocations must be ${lowerTier} likes`);
    }
  }

  await prisma.$transaction(async (tx) => {
    const usedRows = await tx.likeUsedCount.findMany({
      where: {
        userId,
        likeId: { in: sourceIds },
        bucketKey: lowerBucketKey,
      },
    });
    const usedByLikeId = new Map(
      usedRows.map((row) => [`${row.likeId}:${row.bucketKey}`, row.usedCount])
    );

    const ledgerRows = await tx.likeCreditLedger.groupBy({
      by: ["likeId", "bucketKey"],
      where: { userId, likeId: { in: sourceIds }, bucketKey: lowerBucketKey },
      _sum: { delta: true },
    });
    const ledgerByLikeId = new Map(
      ledgerRows.map((row) => [`${row.likeId}:${row.bucketKey}`, row._sum.delta ?? 0])
    );

    const ledgerCreditRows = await tx.likeCreditLedger.groupBy({
      by: ["likeId", "bucketKey"],
      where: {
        userId,
        likeId: { in: sourceIds },
        bucketKey: lowerBucketKey,
        delta: { gt: 0 },
      },
      _sum: { delta: true },
    });
    const ledgerCreditsByLikeId = new Map(
      ledgerCreditRows.map((row) => [`${row.likeId}:${row.bucketKey}`, row._sum.delta ?? 0])
    );

    for (const { likeId, count } of normalized) {
      const source = sourceById.get(likeId)!;
      const { availableCount } = await availableForLike(
        userId,
        source,
        lowerBucketKey,
        timeZone,
        now,
        usedByLikeId,
        ledgerByLikeId,
        ledgerCreditsByLikeId,
        tx
      );
      if (availableCount < count) {
        throw new Error(`Not enough available credits on "${source.label}"`);
      }
    }

    for (const { likeId, count } of normalized) {
      await tx.likeCreditLedger.create({
        data: {
          userId,
          likeId,
          bucketKey: lowerBucketKey,
          delta: -count,
          kind: "combine",
        },
      });
    }

    await tx.likeCreditLedger.create({
      data: {
        userId,
        likeId: target.id,
        bucketKey: targetBucketKey,
        delta: 1,
        kind: "combine",
      },
    });
  });
}

export async function resetTierLikeTracking(
  userId: string,
  tier: RewardTier,
  timeZoneInput: string
): Promise<void> {
  const timeZone = safeTimeZone(timeZoneInput);
  const bucketKey = bucketKeyForTier(tier, timeZone);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.tierLikeReset.upsert({
      where: { userId_tier_bucketKey: { userId, tier, bucketKey } },
      create: { userId, tier, bucketKey, resetAt: now },
      update: { resetAt: now },
    });

    const likes = await tx.userReward.findMany({
      where: { userId, tier },
      select: { id: true },
    });

    if (likes.length > 0) {
      const likeIds = likes.map((l) => l.id);
      await deletePairedLedgerLegs(tx, userId, tier, bucketKey, likeIds, timeZone);
      await tx.likeUsedCount.deleteMany({
        where: {
          userId,
          bucketKey,
          likeId: { in: likeIds },
        },
      });
      await tx.likeCreditLedger.deleteMany({
        where: {
          userId,
          bucketKey,
          likeId: { in: likeIds },
        },
      });
    }
  });
}
