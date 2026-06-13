import type { RecurrenceConfig, TaskRecurrence } from "../domain/recurrence";
import type { TaskSection } from "../domain/tasks";
import type { RewardTier, SpinOutcome } from "../domain/tiers";

export interface User {
  id: string;
  email: string;
}

/** Task (stored as Habit in the database). */
export interface Task {
  id: string;
  name: string;
  tier: RewardTier;
  section: TaskSection;
  scheduledAt: string | null;
  durationMinutes: number | null;
  dueAt: string | null;
  recurrence: TaskRecurrence;
  recurrenceConfig: RecurrenceConfig | null;
  scheduleOverrides: Record<string, { scheduledAt?: string; dueAt?: string | null }> | null;
  persistAfterDone: boolean;
  sortOrder: number;
  achievedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
}

/** Something you like — a possible prize at a tier (stored as UserReward). */
export interface UserLike {
  id: string;
  tier: RewardTier;
  label: string;
  createdAt: string;
}

export interface TokenBalances {
  balances: Record<RewardTier, number>;
  schedule: Record<
    RewardTier,
    { claimCount: number; limit: number; canClaim: boolean }
  >;
}

export interface SpinWheelSlice {
  id: string;
  label: string;
  empty: boolean;
}

export interface Vision {
  id: string;
  name: string;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
}

export interface Goal {
  id: string;
  visionId: string;
  name: string;
  sortOrder: number;
  completedAt: string | null;
  createdAt: string;
}

export interface VisionWithGoals {
  vision: Vision;
  goals: Goal[];
}

export interface BonusToken {
  tier: RewardTier;
  source: string;
}

export interface AchieveResult {
  task: Task;
  token: { id: string; tier: RewardTier };
  bonusTokens?: BonusToken[];
}

export interface SpinResult {
  outcome: SpinOutcome;
  effectiveTier: RewardTier;
  like?: { id: string; label: string };
  spinnerLikes: SpinWheelSlice[];
  winningIndex: number;
  tokenBalances: Record<RewardTier, number>;
  newTokenFromLevelUp: boolean;
}
