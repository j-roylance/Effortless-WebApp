import { RewardTier, TaskRecurrence, TaskSection, type Habit, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  dayKeyForTimezone,
  isSameDayInTimezone,
  type DailyBonusType,
} from "../domain/daily.js";
import { taskOccursOnDay } from "../domain/schedule-overrides.js";

export interface BonusToken {
  tier: RewardTier;
  source: string;
}

type Tx = Prisma.TransactionClient;

export async function getDailySettings(userId: string) {
  const row = await prisma.dailySettings.findUnique({ where: { userId } });
  return {
    planningRewardTier: row?.planningRewardTier ?? null,
    allMustsRewardTier: row?.allMustsRewardTier ?? null,
    allDoDatesRewardTier: row?.allDoDatesRewardTier ?? null,
  };
}

function tasksScheduledOnDay(tasks: Habit[], dayKey: string, timeZone: string): Habit[] {
  return tasks.filter((t) => {
    if (t.recurrence !== TaskRecurrence.None) {
      return taskOccursOnDay(t, dayKey, timeZone);
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

async function claimBonus(
  tx: Tx,
  userId: string,
  dayKey: string,
  bonusType: DailyBonusType,
  tier: RewardTier
): Promise<BonusToken | null> {
  const existing = await tx.dailyBonusClaim.findUnique({
    where: { userId_dayKey_bonusType: { userId, dayKey, bonusType } },
  });
  if (existing) return null;

  try {
    await tx.dailyBonusClaim.create({
      data: { userId, dayKey, bonusType, tier },
    });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "P2002") return null;
    throw e;
  }

  await tx.rewardToken.create({
    data: {
      userId,
      tier,
      source: `daily_${bonusType}`,
    },
  });

  return { tier, source: `daily_${bonusType}` };
}

export async function claimPlanningBonus(
  userId: string,
  timeZone: string,
  dayKey?: string
): Promise<BonusToken | null> {
  const key = dayKey ?? dayKeyForTimezone(timeZone);
  const settings = await getDailySettings(userId);
  if (!settings.planningRewardTier) return null;

  return prisma.$transaction((tx) =>
    claimBonus(tx, userId, key, "planning", settings.planningRewardTier!)
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

export async function evaluateAchievementBonuses(
  userId: string,
  timeZone: string,
  dayKey?: string,
  scheduleSnapshots: ScheduleSnapshot[] = []
): Promise<BonusToken[]> {
  const key = dayKey ?? dayKeyForTimezone(timeZone);
  const settings = await getDailySettings(userId);

  const tasks = applyScheduleSnapshots(
    await prisma.habit.findMany({ where: { userId, archivedAt: null } }),
    scheduleSnapshots
  );

  const bonuses: BonusToken[] = [];

  await prisma.$transaction(async (tx) => {
    if (
      settings.allMustsRewardTier &&
      allMustsCompleteForDay(tasks, key, timeZone)
    ) {
      const token = await claimBonus(
        tx,
        userId,
        key,
        "all_musts",
        settings.allMustsRewardTier
      );
      if (token) bonuses.push(token);
    }

    if (
      settings.allDoDatesRewardTier &&
      allDoDatesCompleteForDay(tasks, key, timeZone)
    ) {
      const token = await claimBonus(
        tx,
        userId,
        key,
        "all_do_dates",
        settings.allDoDatesRewardTier
      );
      if (token) bonuses.push(token);
    }
  });

  return bonuses;
}
