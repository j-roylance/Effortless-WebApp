import { RewardTier, TaskRecurrence, TaskSection, type Habit, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  dayKeyForTimezone,
  isSameDayInTimezone,
  type DailyBonusType,
} from "../domain/daily.js";
import {
  NONE_MILESTONE_REWARD,
  parseMilestoneReward,
  type MilestoneReward,
  type RewardGrant,
} from "../domain/rewards.js";
import { isOccurrenceSkipped, taskOccursOnDay } from "../domain/schedule-overrides.js";
import { logLikeGrant } from "./like-tracking.js";

export interface BonusToken {
  tier: RewardTier;
  source: string;
}

export interface BonusReward {
  label: string;
  source: string;
}

export interface ClaimResult {
  token: BonusToken | null;
  definiteReward: { label: string } | null;
}

type Tx = Prisma.TransactionClient;

export interface DailySettingsRewards {
  planningReward: MilestoneReward;
  allMustsReward: MilestoneReward;
  allDoDatesReward: MilestoneReward;
}

export async function getDailySettings(userId: string): Promise<DailySettingsRewards> {
  const row = await prisma.dailySettings.findUnique({ where: { userId } });
  if (!row) {
    return {
      planningReward: NONE_MILESTONE_REWARD,
      allMustsReward: NONE_MILESTONE_REWARD,
      allDoDatesReward: NONE_MILESTONE_REWARD,
    };
  }
  return {
    planningReward: parseMilestoneReward(row.planningReward),
    allMustsReward: parseMilestoneReward(row.allMustsReward),
    allDoDatesReward: parseMilestoneReward(row.allDoDatesReward),
  };
}

function tasksScheduledOnDay(tasks: Habit[], dayKey: string, timeZone: string): Habit[] {
  return tasks.filter((t) => {
    if (t.recurrence !== TaskRecurrence.None) {
      return (
        taskOccursOnDay(t, dayKey, timeZone) && !isOccurrenceSkipped(t, dayKey)
      );
    }
    return isSameDayInTimezone(t.scheduledAt, dayKey, timeZone);
  });
}

function tasksAchievedOnDay(tasks: Habit[], dayKey: string, timeZone: string): Habit[] {
  return tasks.filter((t) => isSameDayInTimezone(t.achievedAt, dayKey, timeZone));
}

export function allMustsCompleteForDay(
  tasks: Habit[],
  dayKey: string,
  timeZone: string
): boolean {
  const mustToday = tasksScheduledOnDay(tasks, dayKey, timeZone).filter(
    (t) => t.section === TaskSection.Must
  );
  if (mustToday.length === 0) return false;
  const achievedIds = new Set(
    tasksAchievedOnDay(mustToday, dayKey, timeZone).map((t) => t.id)
  );
  return mustToday.every((t) => achievedIds.has(t.id));
}

export function allDoDatesCompleteForDay(
  tasks: Habit[],
  dayKey: string,
  timeZone: string
): boolean {
  const doToday = tasksScheduledOnDay(tasks, dayKey, timeZone);
  if (doToday.length === 0) return false;
  const achievedIds = new Set(
    tasksAchievedOnDay(doToday, dayKey, timeZone).map((t) => t.id)
  );
  return doToday.every((t) => achievedIds.has(t.id));
}

async function resolveMilestoneGrant(
  tx: Tx,
  userId: string,
  reward: MilestoneReward
): Promise<RewardGrant & { likeLabel?: string }> {
  if (reward.kind === "none") return { type: "none" };
  if (reward.kind === "token") return { type: "token", tier: reward.tier };
  if (reward.kind === "custom") return { type: "definite", label: reward.label };
  const like = await tx.userReward.findFirst({
    where: { id: reward.likeId, userId },
    select: { label: true },
  });
  if (!like) return { type: "none" };
  return { type: "definite", label: like.label, likeLabel: like.label };
}

async function claimBonus(
  tx: Tx,
  userId: string,
  dayKey: string,
  bonusType: DailyBonusType,
  reward: MilestoneReward,
  timeZone: string
): Promise<ClaimResult | null> {
  const existing = await tx.dailyBonusClaim.findUnique({
    where: { userId_dayKey_bonusType: { userId, dayKey, bonusType } },
  });
  if (existing) return null;

  const grant = await resolveMilestoneGrant(tx, userId, reward);
  if (grant.type === "none") return null;

  const source = `daily_${bonusType}`;

  if (grant.type === "token") {
    try {
      await tx.dailyBonusClaim.create({
        data: { userId, dayKey, bonusType, tier: grant.tier },
      });
    } catch (e) {
      const err = e as { code?: string };
      if (err.code === "P2002") return null;
      throw e;
    }

    await tx.rewardToken.create({
      data: { userId, tier: grant.tier, source },
    });

    return { token: { tier: grant.tier, source }, definiteReward: null };
  }

  try {
    await tx.dailyBonusClaim.create({
      data: {
        userId,
        dayKey,
        bonusType,
        tier: null,
        rewardLabel: grant.label,
      },
    });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "P2002") return null;
    throw e;
  }

  if (reward.kind === "like") {
    const like = await tx.userReward.findFirst({
      where: { id: reward.likeId, userId },
      select: { tier: true },
    });
    if (like) {
      await logLikeGrant(tx, userId, reward.likeId, like.tier, source, timeZone);
    }
  }

  return {
    token: null,
    definiteReward: { label: grant.label },
  };
}

export async function claimPlanningBonus(
  userId: string,
  timeZone: string,
  dayKey?: string
): Promise<ClaimResult | null> {
  const key = dayKey ?? dayKeyForTimezone(timeZone);
  const settings = await getDailySettings(userId);
  if (settings.planningReward.kind === "none") return null;

  return prisma.$transaction((tx) =>
    claimBonus(tx, userId, key, "planning", settings.planningReward, timeZone)
  );
}

export type ScheduleSnapshot = { taskId: string; scheduledAt: Date | null };

function applyScheduleSnapshots(tasks: Habit[], snapshots: ScheduleSnapshot[]): Habit[] {
  if (snapshots.length === 0) return tasks;
  const map = new Map(snapshots.map((s) => [s.taskId, s.scheduledAt]));
  return tasks.map((t) =>
    map.has(t.id) ? { ...t, scheduledAt: map.get(t.id)! } : t
  );
}

export interface AchievementBonusResult {
  bonusTokens: BonusToken[];
  bonusRewards: BonusReward[];
}

export async function evaluateAchievementBonuses(
  userId: string,
  timeZone: string,
  dayKey?: string,
  scheduleSnapshots: ScheduleSnapshot[] = []
): Promise<AchievementBonusResult> {
  const key = dayKey ?? dayKeyForTimezone(timeZone);
  const settings = await getDailySettings(userId);

  const tasks = applyScheduleSnapshots(
    await prisma.habit.findMany({ where: { userId, archivedAt: null } }),
    scheduleSnapshots
  );

  const bonusTokens: BonusToken[] = [];
  const bonusRewards: BonusReward[] = [];

  await prisma.$transaction(async (tx) => {
    if (
      settings.allMustsReward.kind !== "none" &&
      allMustsCompleteForDay(tasks, key, timeZone)
    ) {
      const result = await claimBonus(
        tx,
        userId,
        key,
        "all_musts",
        settings.allMustsReward,
        timeZone
      );
      if (result?.token) bonusTokens.push(result.token);
      if (result?.definiteReward) {
        bonusRewards.push({
          label: result.definiteReward.label,
          source: "daily_all_musts",
        });
      }
    }

    if (
      settings.allDoDatesReward.kind !== "none" &&
      allDoDatesCompleteForDay(tasks, key, timeZone)
    ) {
      const result = await claimBonus(
        tx,
        userId,
        key,
        "all_do_dates",
        settings.allDoDatesReward,
        timeZone
      );
      if (result?.token) bonusTokens.push(result.token);
      if (result?.definiteReward) {
        bonusRewards.push({
          label: result.definiteReward.label,
          source: "daily_all_do_dates",
        });
      }
    }
  });

  return { bonusTokens, bonusRewards };
}
