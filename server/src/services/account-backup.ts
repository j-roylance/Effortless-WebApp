import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  AI_RECOVERY_GUIDE,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type AccountBackupFile,
  iso,
  parseBackupFile,
} from "../domain/account-backup.js";

export async function exportAccountBackup(
  userId: string,
  email: string
): Promise<AccountBackupFile> {
  const [
    likes,
    tasks,
    visions,
    goals,
    dailySettings,
    wheelConfigs,
    tokens,
    spinLogs,
    likeUsedCounts,
    tierLikeResets,
    likeGrantLogs,
    likeCreditLedger,
    dailyBonusClaims,
  ] = await Promise.all([
    prisma.userReward.findMany({ where: { userId } }),
    prisma.habit.findMany({ where: { userId } }),
    prisma.vision.findMany({ where: { userId } }),
    prisma.goal.findMany({ where: { userId } }),
    prisma.dailySettings.findUnique({ where: { userId } }),
    prisma.tierWheelConfig.findMany({ where: { userId } }),
    prisma.rewardToken.findMany({ where: { userId } }),
    prisma.spinLog.findMany({ where: { userId } }),
    prisma.likeUsedCount.findMany({ where: { userId } }),
    prisma.tierLikeReset.findMany({ where: { userId } }),
    prisma.likeGrantLog.findMany({ where: { userId } }),
    prisma.likeCreditLedger.findMany({ where: { userId } }),
    prisma.dailyBonusClaim.findMany({ where: { userId } }),
  ]);

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    aiRecoveryGuide: AI_RECOVERY_GUIDE,
    account: { email },
    data: {
      likes: likes.map((row) => ({
        id: row.id,
        tier: row.tier,
        label: row.label,
        createdAt: row.createdAt.toISOString(),
      })),
      tasks: tasks.map((row) => ({
        id: row.id,
        name: row.name,
        rewardKind: row.rewardKind,
        tier: row.tier,
        rewardLikeId: row.rewardLikeId,
        customRewardLabel: row.customRewardLabel,
        taskRewards: row.taskRewards,
        section: row.section,
        scheduledAt: iso(row.scheduledAt),
        durationMinutes: row.durationMinutes,
        dueAt: iso(row.dueAt),
        recurrence: row.recurrence,
        recurrenceConfig: row.recurrenceConfig,
        scheduleOverrides: row.scheduleOverrides,
        persistAfterDone: row.persistAfterDone,
        sortOrder: row.sortOrder,
        achievedAt: iso(row.achievedAt),
        archivedAt: iso(row.archivedAt),
        createdAt: row.createdAt.toISOString(),
      })),
      visions: visions.map((row) => ({
        id: row.id,
        name: row.name,
        sortOrder: row.sortOrder,
        archivedAt: iso(row.archivedAt),
        createdAt: row.createdAt.toISOString(),
      })),
      goals: goals.map((row) => ({
        id: row.id,
        visionId: row.visionId,
        name: row.name,
        sortOrder: row.sortOrder,
        completedAt: iso(row.completedAt),
        createdAt: row.createdAt.toISOString(),
        parentGoalId: row.parentGoalId,
      })),
      dailySettings: dailySettings
        ? {
            planningReward: dailySettings.planningReward,
            allMustsReward: dailySettings.allMustsReward,
            allDoDatesReward: dailySettings.allDoDatesReward,
            spinOutcomeWeights: dailySettings.spinOutcomeWeights,
            updatedAt: dailySettings.updatedAt.toISOString(),
          }
        : null,
      wheelConfigs: wheelConfigs.map((row) => ({
        id: row.id,
        tier: row.tier,
        multiplier: row.multiplier,
        sliceCounts: row.sliceCounts,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      tokens: tokens.map((row) => ({
        id: row.id,
        tier: row.tier,
        source: row.source,
        spentAt: iso(row.spentAt),
        createdAt: row.createdAt.toISOString(),
      })),
      spinLogs: spinLogs.map((row) => ({
        id: row.id,
        tokenTier: row.tokenTier,
        outcome: row.outcome,
        effectiveTier: row.effectiveTier,
        rewardId: row.rewardId,
        createdAt: row.createdAt.toISOString(),
      })),
      likeUsedCounts: likeUsedCounts.map((row) => ({
        id: row.id,
        likeId: row.likeId,
        bucketKey: row.bucketKey,
        usedCount: row.usedCount,
      })),
      tierLikeResets: tierLikeResets.map((row) => ({
        id: row.id,
        tier: row.tier,
        bucketKey: row.bucketKey,
        resetAt: row.resetAt.toISOString(),
      })),
      likeGrantLogs: likeGrantLogs.map((row) => ({
        id: row.id,
        likeId: row.likeId,
        tier: row.tier,
        source: row.source,
        createdAt: row.createdAt.toISOString(),
      })),
      likeCreditLedger: likeCreditLedger.map((row) => ({
        id: row.id,
        likeId: row.likeId,
        bucketKey: row.bucketKey,
        delta: row.delta,
        kind: row.kind,
        createdAt: row.createdAt.toISOString(),
      })),
      dailyBonusClaims: dailyBonusClaims.map((row) => ({
        id: row.id,
        dayKey: row.dayKey,
        bonusType: row.bonusType,
        tier: row.tier,
        rewardLabel: row.rewardLabel,
        createdAt: row.createdAt.toISOString(),
      })),
    },
  };
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function deleteAllUserData(tx: Prisma.TransactionClient, userId: string) {
  await tx.likeCreditLedger.deleteMany({ where: { userId } });
  await tx.likeGrantLog.deleteMany({ where: { userId } });
  await tx.likeUsedCount.deleteMany({ where: { userId } });
  await tx.habit.deleteMany({ where: { userId } });
  await tx.goal.deleteMany({ where: { userId } });
  await tx.spinLog.deleteMany({ where: { userId } });
  await tx.rewardToken.deleteMany({ where: { userId } });
  await tx.dailyBonusClaim.deleteMany({ where: { userId } });
  await tx.tierLikeReset.deleteMany({ where: { userId } });
  await tx.tierWheelConfig.deleteMany({ where: { userId } });
  await tx.dailySettings.deleteMany({ where: { userId } });
  await tx.userReward.deleteMany({ where: { userId } });
  await tx.vision.deleteMany({ where: { userId } });
}

export async function importAccountBackup(userId: string, payload: unknown): Promise<void> {
  const backup = parseBackupFile(payload);
  const { data } = backup;

  const likeIds = new Set(data.likes.map((l) => l.id));
  const visionIds = new Set(data.visions.map((v) => v.id));
  const goalIds = new Set(data.goals.map((g) => g.id));

  for (const task of data.tasks) {
    if (task.rewardLikeId && !likeIds.has(task.rewardLikeId)) {
      throw new Error(`Task "${task.name}" references unknown like ${task.rewardLikeId}`);
    }
  }
  for (const goal of data.goals) {
    if (!visionIds.has(goal.visionId)) {
      throw new Error(`Goal "${goal.name}" references unknown vision ${goal.visionId}`);
    }
    if (goal.parentGoalId && !goalIds.has(goal.parentGoalId)) {
      throw new Error(`Goal "${goal.name}" references unknown parent ${goal.parentGoalId}`);
    }
  }

  await prisma.$transaction(async (tx) => {
    await deleteAllUserData(tx, userId);

    if (data.likes.length > 0) {
      await tx.userReward.createMany({
        data: data.likes.map((row) => ({
          id: row.id,
          userId,
          tier: row.tier as import("@prisma/client").RewardTier,
          label: row.label,
          createdAt: new Date(row.createdAt),
        })),
      });
    }

    if (data.visions.length > 0) {
      await tx.vision.createMany({
        data: data.visions.map((row) => ({
          id: row.id,
          userId,
          name: row.name,
          sortOrder: row.sortOrder,
          archivedAt: parseDate(row.archivedAt),
          createdAt: new Date(row.createdAt),
        })),
      });
    }

    const goalsRemaining = [...data.goals];
    const insertedGoals = new Set<string>();
    let safety = goalsRemaining.length + 1;
    while (goalsRemaining.length > 0 && safety > 0) {
      safety -= 1;
      const batch = goalsRemaining.filter(
        (g) => !g.parentGoalId || insertedGoals.has(g.parentGoalId)
      );
      if (batch.length === 0) {
        throw new Error("Invalid goal parent chain in backup");
      }
      for (const row of batch) {
        await tx.goal.create({
          data: {
            id: row.id,
            userId,
            visionId: row.visionId,
            name: row.name,
            sortOrder: row.sortOrder,
            completedAt: parseDate(row.completedAt),
            createdAt: new Date(row.createdAt),
            parentGoalId: row.parentGoalId,
          },
        });
        insertedGoals.add(row.id);
      }
      for (const row of batch) {
        const idx = goalsRemaining.findIndex((g) => g.id === row.id);
        if (idx >= 0) goalsRemaining.splice(idx, 1);
      }
    }

    for (const row of data.tasks) {
      await tx.habit.create({
        data: {
          id: row.id,
          userId,
          name: row.name,
          rewardKind: row.rewardKind as import("@prisma/client").TaskRewardKind,
          tier: row.tier as import("@prisma/client").RewardTier | null,
          rewardLikeId: row.rewardLikeId,
          customRewardLabel: row.customRewardLabel,
          taskRewards:
            row.taskRewards === null || row.taskRewards === undefined
              ? undefined
              : (row.taskRewards as Prisma.InputJsonValue),
          section: row.section as import("@prisma/client").TaskSection,
          scheduledAt: parseDate(row.scheduledAt),
          durationMinutes: row.durationMinutes,
          dueAt: parseDate(row.dueAt),
          recurrence: row.recurrence as import("@prisma/client").TaskRecurrence,
          recurrenceConfig:
            row.recurrenceConfig === null || row.recurrenceConfig === undefined
              ? undefined
              : (row.recurrenceConfig as Prisma.InputJsonValue),
          scheduleOverrides:
            row.scheduleOverrides === null || row.scheduleOverrides === undefined
              ? undefined
              : (row.scheduleOverrides as Prisma.InputJsonValue),
          persistAfterDone: row.persistAfterDone,
          sortOrder: row.sortOrder,
          achievedAt: parseDate(row.achievedAt),
          archivedAt: parseDate(row.archivedAt),
          createdAt: new Date(row.createdAt),
        },
      });
    }

    if (data.dailySettings) {
      await tx.dailySettings.create({
        data: {
          userId,
          planningReward: data.dailySettings.planningReward as Prisma.InputJsonValue,
          allMustsReward: data.dailySettings.allMustsReward as Prisma.InputJsonValue,
          allDoDatesReward: data.dailySettings.allDoDatesReward as Prisma.InputJsonValue,
          spinOutcomeWeights: data.dailySettings.spinOutcomeWeights as Prisma.InputJsonValue,
          updatedAt: new Date(data.dailySettings.updatedAt),
        },
      });
    }

    if (data.wheelConfigs.length > 0) {
      await tx.tierWheelConfig.createMany({
        data: data.wheelConfigs.map((row) => ({
          id: row.id,
          userId,
          tier: row.tier as import("@prisma/client").RewardTier,
          multiplier: row.multiplier,
          sliceCounts: row.sliceCounts as Prisma.InputJsonValue,
          createdAt: new Date(row.createdAt),
          updatedAt: new Date(row.updatedAt),
        })),
      });
    }

    if (data.tokens.length > 0) {
      await tx.rewardToken.createMany({
        data: data.tokens.map((row) => ({
          id: row.id,
          userId,
          tier: row.tier as import("@prisma/client").RewardTier,
          source: row.source,
          spentAt: parseDate(row.spentAt),
          createdAt: new Date(row.createdAt),
        })),
      });
    }

    if (data.spinLogs.length > 0) {
      await tx.spinLog.createMany({
        data: data.spinLogs.map((row) => ({
          id: row.id,
          userId,
          tokenTier: row.tokenTier as import("@prisma/client").RewardTier,
          outcome: row.outcome as import("@prisma/client").SpinOutcome,
          effectiveTier: row.effectiveTier as import("@prisma/client").RewardTier,
          rewardId: row.rewardId,
          createdAt: new Date(row.createdAt),
        })),
      });
    }

    if (data.likeUsedCounts.length > 0) {
      await tx.likeUsedCount.createMany({
        data: data.likeUsedCounts.map((row) => ({
          id: row.id,
          userId,
          likeId: row.likeId,
          bucketKey: row.bucketKey,
          usedCount: row.usedCount,
        })),
      });
    }

    if (data.tierLikeResets.length > 0) {
      await tx.tierLikeReset.createMany({
        data: data.tierLikeResets.map((row) => ({
          id: row.id,
          userId,
          tier: row.tier as import("@prisma/client").RewardTier,
          bucketKey: row.bucketKey,
          resetAt: new Date(row.resetAt),
        })),
      });
    }

    if (data.likeGrantLogs.length > 0) {
      await tx.likeGrantLog.createMany({
        data: data.likeGrantLogs.map((row) => ({
          id: row.id,
          userId,
          likeId: row.likeId,
          tier: row.tier as import("@prisma/client").RewardTier,
          source: row.source,
          createdAt: new Date(row.createdAt),
        })),
      });
    }

    if (data.likeCreditLedger.length > 0) {
      await tx.likeCreditLedger.createMany({
        data: data.likeCreditLedger.map((row) => ({
          id: row.id,
          userId,
          likeId: row.likeId,
          bucketKey: row.bucketKey,
          delta: row.delta,
          kind: row.kind,
          createdAt: new Date(row.createdAt),
        })),
      });
    }

    if (data.dailyBonusClaims.length > 0) {
      await tx.dailyBonusClaim.createMany({
        data: data.dailyBonusClaims.map((row) => ({
          id: row.id,
          userId,
          dayKey: row.dayKey,
          bonusType: row.bonusType,
          tier: row.tier as import("@prisma/client").RewardTier | null,
          rewardLabel: row.rewardLabel,
          createdAt: new Date(row.createdAt),
        })),
      });
    }
  });
}
