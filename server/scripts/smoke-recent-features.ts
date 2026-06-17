/**
 * Dev smoke tests for recent features. Run from server/: npm run smoke:recent
 * Requires DATABASE_URL in .env (skips gracefully if missing).
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { RewardTier, TaskRewardKind } from "@prisma/client";
import { BACKUP_FORMAT, BACKUP_VERSION } from "../src/domain/account-backup.js";
import { dayKeyForTimezone, startOfLocalDayUtc } from "../src/domain/daily.js";
import { conversionCount } from "../src/domain/like-conversions.js";
import {
  parseTaskRewards,
  resolveTaskRewards,
  storageFromTaskRewards,
  taskRewardsFromLegacy,
} from "../src/domain/rewards.js";
import { prisma } from "../src/lib/prisma.js";
import { exportAccountBackup, importAccountBackup } from "../src/services/account-backup.js";
import { likesWithTracking, combineLikeCredits, splitLikeCredit } from "../src/services/like-tracking.js";
import { getScheduleStatus } from "../src/services/spin.js";

let failures = 0;

function pass(name: string) {
  console.log(`  PASS ${name}`);
}

function fail(name: string, detail?: string) {
  failures += 1;
  console.error(`  FAIL ${name}${detail ? `: ${detail}` : ""}`);
}

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) pass(name);
  else fail(name, detail);
}

async function main() {
  console.log("Effortless smoke: recent features\n");

  console.log("1. Domain (no DB)");
  assert("conversionCount Silver", conversionCount(RewardTier.Silver) === 2);
  assert("conversionCount Royal", conversionCount(RewardTier.Royal) === 3);
  assert("conversionCount Stellar", conversionCount(RewardTier.Stellar) === 6);

  const legacy = {
    rewardKind: TaskRewardKind.Token,
    tier: RewardTier.Bronze,
    rewardLikeId: null,
    customRewardLabel: null,
  };
  const fromLegacy = taskRewardsFromLegacy(legacy);
  assert("legacy task reward", fromLegacy.length === 1 && fromLegacy[0]?.kind === "token");

  const stored = storageFromTaskRewards([
    { kind: "token", tier: RewardTier.Silver },
    { kind: "custom", label: "Test" },
  ]);
  assert("storage dual-write", stored.rewardKind === TaskRewardKind.Token);
  assert("storage taskRewards length", stored.taskRewards.length === 2);

  const resolved = resolveTaskRewards(null, legacy);
  assert("resolve legacy fallback", resolved.length === 1);

  const parsed = parseTaskRewards([{ kind: "token", tier: "Gold" }]);
  assert("parseTaskRewards", parsed.length === 1 && parsed[0]?.tier === "Gold");

  const laMidnight = startOfLocalDayUtc("America/Los_Angeles", new Date("2025-06-15T07:00:00Z"));
  const laParts = dayKeyForTimezone("America/Los_Angeles", laMidnight);
  assert(
    "startOfLocalDayUtc LA",
    laParts === "2025-06-15" && laMidnight.toISOString() === "2025-06-15T07:00:00.000Z"
  );

  if (!process.env.DATABASE_URL) {
    console.log("\nSKIP DB tests (DATABASE_URL not set)");
    process.exit(failures > 0 ? 1 : 0);
  }

  console.log("\n2. Database");
  const email = `smoke-${Date.now()}@effortless.test`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash("smoke-test-password", 10),
    },
  });

  try {
    const bronzeLike = await prisma.userReward.create({
      data: { userId: user.id, tier: RewardTier.Bronze, label: "Smoke Bronze A" },
    });
    const bronzeLike2 = await prisma.userReward.create({
      data: { userId: user.id, tier: RewardTier.Bronze, label: "Smoke Bronze B" },
    });
    const silverLike = await prisma.userReward.create({
      data: { userId: user.id, tier: RewardTier.Silver, label: "Smoke Silver" },
    });

    await prisma.likeGrantLog.create({
      data: {
        userId: user.id,
        likeId: silverLike.id,
        tier: RewardTier.Silver,
        source: "smoke_test",
      },
    });

    const tracking = await likesWithTracking(user.id, "UTC");
    const silver = tracking.likes.find((l) => l.id === silverLike.id);
    assert("likesWithTracking availableCount", silver?.availableCount === 1);
    assert("likesWithTracking awardedCount from grant", silver?.awardedCount === 1);
    assert(
      "likesWithTracking has ledgerDelta",
      typeof silver?.ledgerDelta === "number"
    );

    await splitLikeCredit(
      user.id,
      silverLike.id,
      [
        { likeId: bronzeLike.id, count: 1 },
        { likeId: bronzeLike2.id, count: 1 },
      ],
      "UTC"
    );

    const afterSplit = await likesWithTracking(user.id, "UTC");
    const silverAfter = afterSplit.likes.find((l) => l.id === silverLike.id);
    const bronzeAfter = afterSplit.likes.find((l) => l.id === bronzeLike.id);
    assert("split reduces silver available", silverAfter?.availableCount === 0);
    assert("split keeps silver awarded", silverAfter?.awardedCount === 1);
    assert("split credits bronze available", bronzeAfter?.availableCount === 1);
    assert("split credits bronze awarded", bronzeAfter?.awardedCount === 1);

    await combineLikeCredits(
      user.id,
      silverLike.id,
      [
        { likeId: bronzeLike.id, count: 1 },
        { likeId: bronzeLike2.id, count: 1 },
      ],
      "UTC"
    );

    const afterCombine = await likesWithTracking(user.id, "UTC");
    const silverCombined = afterCombine.likes.find((l) => l.id === silverLike.id);
    assert("combine restores silver available", silverCombined?.availableCount === 1);
    assert("combine increments silver awarded", silverCombined?.awardedCount === 2);

    await prisma.habit.create({
      data: {
        userId: user.id,
        name: "Smoke task",
        rewardKind: TaskRewardKind.Token,
        tier: RewardTier.Bronze,
        taskRewards: [
          { kind: "token", tier: "Bronze" },
          { kind: "custom", label: "Extra" },
        ],
      },
    });

    const exported = await exportAccountBackup(user.id, email);
    assert("backup format", exported.format === BACKUP_FORMAT);
    assert("backup version", exported.version === BACKUP_VERSION);
    assert("backup has aiRecoveryGuide", exported.aiRecoveryGuide.length > 100);
    assert("backup likes count", exported.data.likes.length === 3);

    const countsBefore = {
      likes: await prisma.userReward.count({ where: { userId: user.id } }),
      tasks: await prisma.habit.count({ where: { userId: user.id } }),
    };

    await importAccountBackup(user.id, exported);

    const countsAfter = {
      likes: await prisma.userReward.count({ where: { userId: user.id } }),
      tasks: await prisma.habit.count({ where: { userId: user.id } }),
    };
    assert(
      "backup round-trip likes",
      countsAfter.likes === countsBefore.likes,
      `${countsAfter.likes} vs ${countsBefore.likes}`
    );
    assert(
      "backup round-trip tasks",
      countsAfter.tasks === countsBefore.tasks,
      `${countsAfter.tasks} vs ${countsBefore.tasks}`
    );

    const schedule = await getScheduleStatus(user.id, "UTC");
    const bronzeSchedule = schedule[RewardTier.Bronze];
    assert("schedule has canClaim", typeof bronzeSchedule?.canClaim === "boolean");
    assert("schedule has claimCount", typeof bronzeSchedule?.claimCount === "number");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }

  console.log(`\n${failures === 0 ? "All smoke tests passed." : `${failures} test(s) failed.`}`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
