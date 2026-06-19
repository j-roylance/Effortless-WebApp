import type { LikeCredit, RewardTier } from "@prisma/client";
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
  TIER_USABLE_LIFETIME_LABEL,
  bucketKeyForTier,
  expiresAtForTier,
} from "../domain/tiers.js";
import { prisma } from "../lib/prisma.js";

type Tx = Prisma.TransactionClient;

export interface LikeTrackingMeta {
  usableLifetimeLabel: string;
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

export interface LikeCreditCounts {
  availableCount: number;
  usedCount: number;
  rewardedCount: number;
}

function availableCreditWhere(
  userId: string,
  likeId: string,
  now: Date
): Prisma.LikeCreditWhereInput {
  return {
    userId,
    likeId,
    usedAt: null,
    voidedAt: null,
    expiresAt: { gt: now },
  };
}

function usedCreditWhere(userId: string, likeId: string): Prisma.LikeCreditWhereInput {
  return {
    userId,
    likeId,
    usedAt: { not: null },
    voidedAt: null,
  };
}

export async function countLikeCredits(
  userId: string,
  likeId: string,
  now: Date,
  tx: Tx = prisma
): Promise<LikeCreditCounts> {
  const [availableCount, usedCount] = await Promise.all([
    tx.likeCredit.count({ where: availableCreditWhere(userId, likeId, now) }),
    tx.likeCredit.count({ where: usedCreditWhere(userId, likeId) }),
  ]);
  const rewardedCount = availableCount + usedCount;
  return { availableCount, usedCount, rewardedCount };
}

async function availableCreditsFifo(
  tx: Tx,
  userId: string,
  likeId: string,
  now: Date,
  take: number
): Promise<LikeCredit[]> {
  return tx.likeCredit.findMany({
    where: availableCreditWhere(userId, likeId, now),
    orderBy: { earnedAt: "asc" },
    take,
  });
}

async function voidOldestAvailableCredits(
  tx: Tx,
  userId: string,
  likeId: string,
  count: number,
  now: Date
): Promise<void> {
  const credits = await availableCreditsFifo(tx, userId, likeId, now, count);
  if (credits.length < count) {
    throw new Error("Not enough available credits");
  }
  await tx.likeCredit.updateMany({
    where: { id: { in: credits.map((c) => c.id) } },
    data: { voidedAt: now },
  });
}

async function markUsedFifo(
  tx: Tx,
  userId: string,
  likeId: string,
  count: number,
  now: Date
): Promise<void> {
  const credits = await availableCreditsFifo(tx, userId, likeId, now, count);
  if (credits.length < count) {
    throw new Error("Not enough available credits to mark used");
  }
  await tx.likeCredit.updateMany({
    where: { id: { in: credits.map((c) => c.id) } },
    data: { usedAt: now },
  });
}

async function unmarkUsedFifo(
  tx: Tx,
  userId: string,
  likeId: string,
  count: number
): Promise<void> {
  const credits = await tx.likeCredit.findMany({
    where: usedCreditWhere(userId, likeId),
    orderBy: { usedAt: "desc" },
    take: count,
  });
  if (credits.length < count) {
    throw new Error("Not enough used credits to unmark");
  }
  await tx.likeCredit.updateMany({
    where: { id: { in: credits.map((c) => c.id) } },
    data: { usedAt: null },
  });
}

export async function createLikeCredit(
  tx: Tx,
  userId: string,
  likeId: string,
  tier: RewardTier,
  source: string,
  sourceId: string | null,
  timeZoneInput: string,
  earnedAt: Date = new Date()
): Promise<{ id: string }> {
  const timeZone = safeTimeZone(timeZoneInput);
  const expiresAt = expiresAtForTier(earnedAt, tier, timeZone);
  const row = await tx.likeCredit.create({
    data: {
      userId,
      likeId,
      tier,
      earnedAt,
      expiresAt,
      source,
      sourceId,
    },
  });
  return { id: row.id };
}

const PRIZE_OUTCOMES: SpinOutcome[] = [
  SpinOutcome.Win,
  SpinOutcome.LevelUp,
  SpinOutcome.LevelDown,
];

type ReplayEvent =
  | { kind: "grant"; at: Date; likeId: string; tier: RewardTier; sourceId: string }
  | { kind: "spin"; at: Date; likeId: string; tier: RewardTier; sourceId: string }
  | {
      kind: "ledger";
      at: Date;
      likeId: string;
      tier: RewardTier;
      delta: number;
      sourceId: string;
      ledgerKind: string;
    };

function availableCreditWhereAt(
  userId: string,
  likeId: string,
  asOf: Date
): Prisma.LikeCreditWhereInput {
  return {
    userId,
    likeId,
    earnedAt: { lte: asOf },
    usedAt: null,
    voidedAt: null,
    expiresAt: { gt: asOf },
  };
}

async function availableCreditIdsAt(
  tx: Tx,
  userId: string,
  likeId: string,
  asOf: Date,
  take?: number
): Promise<string[]> {
  const rows = await tx.likeCredit.findMany({
    where: availableCreditWhereAt(userId, likeId, asOf),
    orderBy: { earnedAt: "asc" },
    take,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function voidCreditsFifoAt(
  tx: Tx,
  userId: string,
  likeId: string,
  count: number,
  asOf: Date
): Promise<void> {
  const ids = await availableCreditIdsAt(tx, userId, likeId, asOf, count);
  if (ids.length < count) return;
  await tx.likeCredit.updateMany({
    where: { id: { in: ids } },
    data: { voidedAt: asOf },
  });
}

/** Rebuild LikeCredit rows from grant/spin/ledger history (for migration and v1 backup import). */
export async function replayLikeCreditsForUser(
  userId: string,
  timeZoneInput: string,
  tx: Tx = prisma
): Promise<void> {
  const timeZone = safeTimeZone(timeZoneInput);
  const existing = await tx.likeCredit.count({ where: { userId } });
  if (existing > 0) return;

  const [grants, spins, ledger, likes] = await Promise.all([
    tx.likeGrantLog.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    tx.spinLog.findMany({
      where: {
        userId,
        rewardId: { not: null },
        outcome: { in: PRIZE_OUTCOMES },
      },
      orderBy: { createdAt: "asc" },
    }),
    tx.likeCreditLedger.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    tx.userReward.findMany({ where: { userId }, select: { id: true, tier: true } }),
  ]);

  if (grants.length === 0 && spins.length === 0 && ledger.length === 0) return;

  const tierByLikeId = new Map(likes.map((l) => [l.id, l.tier]));
  const events: ReplayEvent[] = [];

  for (const grant of grants) {
    events.push({
      kind: "grant",
      at: grant.createdAt,
      likeId: grant.likeId,
      tier: grant.tier,
      sourceId: grant.id,
    });
  }

  for (const spin of spins) {
    if (!spin.rewardId) continue;
    events.push({
      kind: "spin",
      at: spin.createdAt,
      likeId: spin.rewardId,
      tier: spin.effectiveTier,
      sourceId: spin.id,
    });
  }

  for (const row of ledger) {
    const tier = tierByLikeId.get(row.likeId);
    if (!tier) continue;
    events.push({
      kind: "ledger",
      at: row.createdAt,
      likeId: row.likeId,
      tier,
      delta: row.delta,
      sourceId: row.id,
      ledgerKind: row.kind,
    });
  }

  events.sort((a, b) => a.at.getTime() - b.at.getTime());

  for (const event of events) {
    if (event.kind === "grant" || event.kind === "spin") {
      await createLikeCredit(
        tx,
        userId,
        event.likeId,
        event.tier,
        event.kind,
        event.sourceId,
        timeZone,
        event.at
      );
    } else if (event.delta > 0) {
      for (let i = 0; i < event.delta; i += 1) {
        await createLikeCredit(
          tx,
          userId,
          event.likeId,
          event.tier,
          event.ledgerKind,
          event.sourceId,
          timeZone,
          event.at
        );
      }
    } else if (event.delta < 0) {
      await voidCreditsFifoAt(tx, userId, event.likeId, Math.abs(event.delta), event.at);
    }
  }

  const usedRows = await tx.likeUsedCount.findMany({ where: { userId } });
  const usedByLikeId = new Map<string, number>();
  for (const row of usedRows) {
    usedByLikeId.set(row.likeId, (usedByLikeId.get(row.likeId) ?? 0) + row.usedCount);
  }

  const now = new Date();
  for (const [likeId, usedTotal] of usedByLikeId) {
    const ids = await availableCreditIdsAt(tx, userId, likeId, now, usedTotal);
    if (ids.length === 0) continue;
    await tx.likeCredit.updateMany({
      where: { id: { in: ids } },
      data: { usedAt: now },
    });
  }
}

export function trackingMetaForTiers(): Record<RewardTier, LikeTrackingMeta> {
  const meta = {} as Record<RewardTier, LikeTrackingMeta>;
  for (const tier of TIERS) {
    meta[tier] = {
      usableLifetimeLabel: TIER_USABLE_LIFETIME_LABEL[tier],
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
  const now = new Date();
  const trackingByTier = trackingMetaForTiers();

  const where: { userId: string; tier?: RewardTier } = { userId };
  if (tierFilter) where.tier = tierFilter;

  const likes = await prisma.userReward.findMany({
    where,
    orderBy: [{ tier: "asc" }, { createdAt: "asc" }],
  });

  const availableRows = await prisma.likeCredit.groupBy({
    by: ["likeId"],
    where: {
      userId,
      voidedAt: null,
      usedAt: null,
      expiresAt: { gt: now },
    },
    _count: { _all: true },
  });

  const usedRows = await prisma.likeCredit.groupBy({
    by: ["likeId"],
    where: {
      userId,
      voidedAt: null,
      usedAt: { not: null },
    },
    _count: { _all: true },
  });

  const availableByLikeId = new Map(
    availableRows.map((row) => [row.likeId, row._count._all])
  );
  const usedByLikeId = new Map(usedRows.map((row) => [row.likeId, row._count._all]));

  const result: LikeWithTracking[] = likes.map((like) => {
    const availableCount = availableByLikeId.get(like.id) ?? 0;
    const usedCount = usedByLikeId.get(like.id) ?? 0;
    const rewardedCount = availableCount + usedCount;

    return {
      id: like.id,
      userId: like.userId,
      tier: like.tier,
      label: like.label,
      createdAt: like.createdAt.toISOString(),
      rewardedCount,
      awardedCount: rewardedCount,
      usedCount,
      ledgerDelta: 0,
      availableCount,
    };
  });

  return { likes: result, trackingByTier };
}

export async function logLikeGrant(
  tx: Tx,
  userId: string,
  likeId: string,
  tier: RewardTier,
  source: string,
  timeZoneInput: string
): Promise<void> {
  const grant = await tx.likeGrantLog.create({
    data: { userId, likeId, tier, source },
  });
  await createLikeCredit(
    tx,
    userId,
    likeId,
    tier,
    "grant",
    grant.id,
    timeZoneInput,
    grant.createdAt
  );
}

export async function logSpinLikeWin(
  tx: Tx,
  userId: string,
  likeId: string,
  tier: RewardTier,
  spinLogId: string,
  timeZoneInput: string,
  earnedAt: Date
): Promise<void> {
  await createLikeCredit(
    tx,
    userId,
    likeId,
    tier,
    "spin",
    spinLogId,
    timeZoneInput,
    earnedAt
  );
}

export async function adjustLikeUsedCount(
  userId: string,
  likeId: string,
  timeZoneInput: string,
  delta?: number,
  usedCount?: number
): Promise<{ usedCount: number }> {
  void timeZoneInput;
  const like = await prisma.userReward.findFirst({
    where: { id: likeId, userId },
  });
  if (!like) throw Object.assign(new Error("Not found"), { status: 404 });

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const current = await tx.likeCredit.count({
      where: usedCreditWhere(userId, likeId),
    });

    let target: number;
    if (usedCount !== undefined) {
      target = Math.max(0, Math.floor(usedCount));
    } else if (delta !== undefined) {
      target = Math.max(0, current + delta);
    } else {
      throw new Error("Provide delta or usedCount");
    }

    if (target > current) {
      await markUsedFifo(tx, userId, likeId, target - current, now);
    } else if (target < current) {
      await unmarkUsedFifo(tx, userId, likeId, current - target);
    }
  });

  const { usedCount: next } = await countLikeCredits(userId, likeId, now);
  return { usedCount: next };
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
    const { availableCount } = await countLikeCredits(userId, source.id, now, tx);
    if (availableCount < 1) {
      throw new Error("Not enough available credits to split");
    }

    await voidOldestAvailableCredits(tx, userId, source.id, 1, now);

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
      const ledger = await tx.likeCreditLedger.create({
        data: {
          userId,
          likeId,
          bucketKey: lowerBucketKey,
          delta: count,
          kind: "split",
        },
      });

      for (let i = 0; i < count; i += 1) {
        await createLikeCredit(
          tx,
          userId,
          likeId,
          lowerTier,
          "split",
          ledger.id,
          timeZoneInput,
          now
        );
      }
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
    for (const { likeId, count } of normalized) {
      const source = sourceById.get(likeId)!;
      const { availableCount } = await countLikeCredits(userId, source.id, now, tx);
      if (availableCount < count) {
        throw new Error(`Not enough available credits on "${source.label}"`);
      }
    }

    for (const { likeId, count } of normalized) {
      await voidOldestAvailableCredits(tx, userId, likeId, count, now);

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

    const targetLedger = await tx.likeCreditLedger.create({
      data: {
        userId,
        likeId: target.id,
        bucketKey: targetBucketKey,
        delta: 1,
        kind: "combine",
      },
    });

    await createLikeCredit(
      tx,
      userId,
      target.id,
      target.tier,
      "combine",
      targetLedger.id,
      timeZoneInput,
      now
    );
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
      await tx.likeCredit.updateMany({
        where: {
          userId,
          likeId: { in: likeIds },
          voidedAt: null,
        },
        data: { voidedAt: now },
      });
    }
  });
}
