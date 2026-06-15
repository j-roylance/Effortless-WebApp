import type { RewardTier, UserReward } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { safeTimeZone } from "../domain/daily.js";
import {
  TIERS,
  TIER_FREQUENCY_LABEL,
  bucketKeyForTier,
  bucketStartForTier,
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
  usedCount: number;
}

async function effectiveStartForTier(
  userId: string,
  tier: RewardTier,
  bucketKey: string,
  timeZone: string,
  now: Date
): Promise<Date> {
  const periodStart = bucketStartForTier(tier, now, timeZone);
  const reset = await prisma.tierLikeReset.findUnique({
    where: { userId_tier_bucketKey: { userId, tier, bucketKey } },
  });
  if (!reset) return periodStart;
  return reset.resetAt > periodStart ? reset.resetAt : periodStart;
}

async function rewardedCountForLike(
  userId: string,
  likeId: string,
  effectiveStart: Date
): Promise<number> {
  const [spinCount, grantCount] = await Promise.all([
    prisma.spinLog.count({
      where: {
        userId,
        rewardId: likeId,
        createdAt: { gte: effectiveStart },
      },
    }),
    prisma.likeGrantLog.count({
      where: {
        userId,
        likeId,
        createdAt: { gte: effectiveStart },
      },
    }),
  ]);
  return spinCount + grantCount;
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

  const likesByTier = new Map<RewardTier, UserReward[]>();
  for (const like of likes) {
    const list = likesByTier.get(like.tier) ?? [];
    list.push(like);
    likesByTier.set(like.tier, list);
  }

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

  const result: LikeWithTracking[] = [];

  for (const like of likes) {
    const bucketKey = trackingByTier[like.tier].bucketKey;
    const effectiveStart = await effectiveStartForTier(
      userId,
      like.tier,
      bucketKey,
      timeZone,
      now
    );
    const rewardedCount = await rewardedCountForLike(userId, like.id, effectiveStart);
    const usedCount = usedByLikeId.get(`${like.id}:${bucketKey}`) ?? 0;

    result.push({
      id: like.id,
      userId: like.userId,
      tier: like.tier,
      label: like.label,
      createdAt: like.createdAt.toISOString(),
      rewardedCount,
      usedCount,
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
      await tx.likeUsedCount.deleteMany({
        where: {
          userId,
          bucketKey,
          likeId: { in: likes.map((l) => l.id) },
        },
      });
    }
  });
}
