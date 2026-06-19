/**
 * One-time backfill: replay grant/spin/ledger history into LikeCredit rows.
 * Run from server/: npx tsx scripts/migrate-like-credits.ts
 */
import "dotenv/config";
import { RewardTier, SpinOutcome } from "@prisma/client";
import { expiresAtForTier } from "../src/domain/tiers.js";
import { prisma } from "../src/lib/prisma.js";

const PRIZE_OUTCOMES: SpinOutcome[] = [
  SpinOutcome.Win,
  SpinOutcome.LevelUp,
  SpinOutcome.LevelDown,
];

const MIGRATION_TIMEZONE = "UTC";

type ReplayEvent =
  | { kind: "grant"; at: Date; userId: string; likeId: string; tier: RewardTier; sourceId: string }
  | { kind: "spin"; at: Date; userId: string; likeId: string; tier: RewardTier; sourceId: string }
  | {
      kind: "ledger";
      at: Date;
      userId: string;
      likeId: string;
      tier: RewardTier;
      delta: number;
      sourceId: string;
      ledgerKind: string;
    };

async function availableCreditIds(
  userId: string,
  likeId: string,
  now: Date
): Promise<string[]> {
  const rows = await prisma.likeCredit.findMany({
    where: {
      userId,
      likeId,
      usedAt: null,
      voidedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { earnedAt: "asc" },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function createCredit(
  userId: string,
  likeId: string,
  tier: RewardTier,
  source: string,
  sourceId: string,
  earnedAt: Date
): Promise<void> {
  await prisma.likeCredit.create({
    data: {
      userId,
      likeId,
      tier,
      earnedAt,
      expiresAt: expiresAtForTier(earnedAt, tier, MIGRATION_TIMEZONE),
      source,
      sourceId,
    },
  });
}

async function voidCreditsFifo(
  userId: string,
  likeId: string,
  count: number,
  now: Date
): Promise<void> {
  const ids = await availableCreditIds(userId, likeId, now);
  const toVoid = ids.slice(0, count);
  if (toVoid.length < count) return;
  await prisma.likeCredit.updateMany({
    where: { id: { in: toVoid } },
    data: { voidedAt: now },
  });
}

async function migrateUser(userId: string): Promise<void> {
  const existing = await prisma.likeCredit.count({ where: { userId } });
  if (existing > 0) return;

  const [grants, spins, ledger, likes] = await Promise.all([
    prisma.likeGrantLog.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.spinLog.findMany({
      where: {
        userId,
        rewardId: { not: null },
        outcome: { in: PRIZE_OUTCOMES },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.likeCreditLedger.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.userReward.findMany({ where: { userId }, select: { id: true, tier: true } }),
  ]);

  const tierByLikeId = new Map(likes.map((l) => [l.id, l.tier]));
  const events: ReplayEvent[] = [];

  for (const grant of grants) {
    events.push({
      kind: "grant",
      at: grant.createdAt,
      userId: grant.userId,
      likeId: grant.likeId,
      tier: grant.tier,
      sourceId: grant.id,
    });
  }

  for (const spin of spins) {
    if (!spin.rewardId) continue;
    const tier = spin.effectiveTier;
    events.push({
      kind: "spin",
      at: spin.createdAt,
      userId: spin.userId,
      likeId: spin.rewardId,
      tier,
      sourceId: spin.id,
    });
  }

  for (const row of ledger) {
    const tier = tierByLikeId.get(row.likeId);
    if (!tier) continue;
    events.push({
      kind: "ledger",
      at: row.createdAt,
      userId: row.userId,
      likeId: row.likeId,
      tier,
      delta: row.delta,
      sourceId: row.id,
      ledgerKind: row.kind,
    });
  }

  events.sort((a, b) => a.at.getTime() - b.at.getTime());

  for (const event of events) {
    if (event.kind === "grant") {
      await createCredit(
        event.userId,
        event.likeId,
        event.tier,
        "grant",
        event.sourceId,
        event.at
      );
    } else if (event.kind === "spin") {
      await createCredit(
        event.userId,
        event.likeId,
        event.tier,
        "spin",
        event.sourceId,
        event.at
      );
    } else if (event.delta > 0) {
      for (let i = 0; i < event.delta; i += 1) {
        await createCredit(
          event.userId,
          event.likeId,
          event.tier,
          event.ledgerKind,
          event.sourceId,
          event.at
        );
      }
    } else if (event.delta < 0) {
      await voidCreditsFifo(event.userId, event.likeId, Math.abs(event.delta), event.at);
    }
  }

  const usedRows = await prisma.likeUsedCount.findMany({ where: { userId } });
  const usedByLikeId = new Map<string, number>();
  for (const row of usedRows) {
    usedByLikeId.set(row.likeId, (usedByLikeId.get(row.likeId) ?? 0) + row.usedCount);
  }

  const now = new Date();
  for (const [likeId, usedTotal] of usedByLikeId) {
    const ids = await availableCreditIds(userId, likeId, now);
    const toMark = ids.slice(0, usedTotal);
    if (toMark.length === 0) continue;
    await prisma.likeCredit.updateMany({
      where: { id: { in: toMark } },
      data: { usedAt: now },
    });
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const users = await prisma.user.findMany({ select: { id: true } });
  let migrated = 0;
  for (const user of users) {
    const before = await prisma.likeCredit.count({ where: { userId: user.id } });
    if (before > 0) continue;
    await migrateUser(user.id);
    const after = await prisma.likeCredit.count({ where: { userId: user.id } });
    if (after > 0) migrated += 1;
  }

  console.log(`Migrated like credits for ${migrated} user(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
