/**
 * Dev smoke tests for recent features. Run from server/: npm run smoke:recent
 * Requires DATABASE_URL in .env (skips gracefully if missing).
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { RewardTier, SpinOutcome, TaskRewardKind } from "@prisma/client";
import { BACKUP_FORMAT, BACKUP_VERSION } from "../src/domain/account-backup.js";
import { dayKeyForTimezone, startOfLocalDayUtc } from "../src/domain/daily.js";
import { conversionCount } from "../src/domain/like-conversions.js";
import {
  parseTaskRewards,
  resolveTaskRewards,
  storageFromTaskRewards,
  taskRewardsFromLegacy,
} from "../src/domain/rewards.js";
import { DEFAULT_SPIN_OUTCOME_WEIGHTS } from "../src/domain/spin-odds.js";
import {
  applyPityToWeights,
  countConsecutivePityLosses,
  isPityLoss,
} from "../src/domain/spin-pity.js";
import { expiresAtForTier } from "../src/domain/tiers.js";
import { prisma } from "../src/lib/prisma.js";
import { exportAccountBackup, importAccountBackup } from "../src/services/account-backup.js";
import {
  adjustLikeUsedCount,
  likesWithTracking,
  combineLikeCredits,
  logLikeGrant,
  splitLikeCredit,
} from "../src/services/like-tracking.js";
import { getPityStatusForTier, getScheduleStatus } from "../src/services/spin.js";

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

  const earned = new Date("2025-01-15T15:00:00.000Z");
  const bronzeExpiry = expiresAtForTier(earned, RewardTier.Bronze, "UTC");
  assert(
    "expiresAtForTier Bronze +24h",
    bronzeExpiry.getTime() === earned.getTime() + 24 * 60 * 60 * 1000
  );
  const emperorExpiry = expiresAtForTier(earned, RewardTier.Emperor, "UTC");
  assert(
    "expiresAtForTier Emperor +1 month",
    emperorExpiry.toISOString() === "2025-02-15T15:00:00.000Z"
  );
  const jan31 = new Date("2025-01-31T12:00:00.000Z");
  const febClamp = expiresAtForTier(jan31, RewardTier.Emperor, "UTC");
  assert(
    "expiresAtForTier month-end clamp",
    febClamp.toISOString() === "2025-02-28T12:00:00.000Z"
  );

  assert(
    "isPityLoss Bronze LevelDown",
    isPityLoss(RewardTier.Bronze, SpinOutcome.LevelDown)
  );
  assert(
    "isPityLoss Silver LevelDown not loss",
    !isPityLoss(RewardTier.Silver, SpinOutcome.LevelDown)
  );
  assert(
    "countConsecutivePityLosses two None",
    countConsecutivePityLosses(
      [{ outcome: SpinOutcome.NoReward }, { outcome: SpinOutcome.NoReward }],
      RewardTier.Bronze
    ) === 2
  );
  assert(
    "countConsecutivePityLosses stops at win",
    countConsecutivePityLosses(
      [{ outcome: SpinOutcome.NoReward }, { outcome: SpinOutcome.Win }],
      RewardTier.Bronze
    ) === 1
  );

  const base = DEFAULT_SPIN_OUTCOME_WEIGHTS;
  const oneLoss = applyPityToWeights(base, 1);
  assert(
    "applyPity 1 loss doubles win",
    oneLoss.win === 50 && oneLoss.levelUp === 25
  );
  assert(
    "applyPity 1 loss sums to 100",
    oneLoss.win + oneLoss.levelUp + oneLoss.noReward + oneLoss.levelDown === 100
  );
  const twoLoss = applyPityToWeights(base, 2);
  assert(
    "applyPity 2 losses max win",
    twoLoss.win === 75 && twoLoss.noReward === 0 && twoLoss.levelDown === 0
  );

  const tight = { win: 40, levelUp: 30, noReward: 20, levelDown: 10 };
  const tightOne = applyPityToWeights(tight, 1);
  assert(
    "applyPity partial double drains loss pool",
    tightOne.win === 70 && tightOne.levelUp === 30 && tightOne.noReward === 0 && tightOne.levelDown === 0
  );

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

    await prisma.$transaction((tx) =>
      logLikeGrant(tx, user.id, silverLike.id, RewardTier.Silver, "smoke_test", "UTC")
    );

    const tracking = await likesWithTracking(user.id, "UTC");
    const silver = tracking.likes.find((l) => l.id === silverLike.id);
    assert("likesWithTracking availableCount", silver?.availableCount === 1);
    assert("likesWithTracking earned from grant", silver?.rewardedCount === 1);
    assert(
      "tracking meta usable lifetime",
      tracking.trackingByTier[RewardTier.Silver].usableLifetimeLabel.includes("24 hours")
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
    assert("split zeroes silver earned", silverAfter?.rewardedCount === 0);
    assert("split credits bronze available", bronzeAfter?.availableCount === 1);
    assert("split credits bronze earned", bronzeAfter?.rewardedCount === 1);

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
    assert("combine silver earned", silverCombined?.rewardedCount === 1);

    await adjustLikeUsedCount(user.id, silverLike.id, "UTC", 1);
    const afterUsed = await likesWithTracking(user.id, "UTC");
    const silverUsed = afterUsed.likes.find((l) => l.id === silverLike.id);
    assert("mark used reduces available", silverUsed?.availableCount === 0);
    assert("mark used increments used", silverUsed?.usedCount === 1);
    assert("earned stays after use", silverUsed?.rewardedCount === 1);

    await prisma.likeCredit.updateMany({
      where: { userId: user.id, likeId: silverLike.id },
      data: { expiresAt: new Date("2020-01-01T00:00:00.000Z") },
    });
    const afterExpiry = await likesWithTracking(user.id, "UTC");
    const silverExpired = afterExpiry.likes.find((l) => l.id === silverLike.id);
    assert("expired credit drops available", silverExpired?.availableCount === 0);
    assert("used credit stays in earned", silverExpired?.rewardedCount === 1);

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
    assert("backup likeCredits count", exported.data.likeCredits.length > 0);

    const countsBefore = {
      likes: await prisma.userReward.count({ where: { userId: user.id } }),
      tasks: await prisma.habit.count({ where: { userId: user.id } }),
      credits: await prisma.likeCredit.count({ where: { userId: user.id } }),
    };

    await importAccountBackup(user.id, exported);

    const countsAfter = {
      likes: await prisma.userReward.count({ where: { userId: user.id } }),
      tasks: await prisma.habit.count({ where: { userId: user.id } }),
      credits: await prisma.likeCredit.count({ where: { userId: user.id } }),
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
    assert(
      "backup round-trip likeCredits",
      countsAfter.credits === countsBefore.credits,
      `${countsAfter.credits} vs ${countsBefore.credits}`
    );

    const schedule = await getScheduleStatus(user.id, "UTC");
    const bronzeSchedule = schedule[RewardTier.Bronze];
    assert("schedule has canClaim", typeof bronzeSchedule?.canClaim === "boolean");
    assert("schedule has claimCount", typeof bronzeSchedule?.claimCount === "number");

    await prisma.spinLog.createMany({
      data: [
        {
          userId: user.id,
          tokenTier: RewardTier.Bronze,
          outcome: SpinOutcome.NoReward,
          effectiveTier: RewardTier.Bronze,
        },
        {
          userId: user.id,
          tokenTier: RewardTier.Bronze,
          outcome: SpinOutcome.NoReward,
          effectiveTier: RewardTier.Bronze,
        },
      ],
    });
    const bronzePity = await getPityStatusForTier(user.id, RewardTier.Bronze, base);
    assert(
      "pity 2 Bronze losses maxes reward",
      bronzePity.consecutiveLosses === 2 && bronzePity.effectiveWeights.win === 75
    );
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
