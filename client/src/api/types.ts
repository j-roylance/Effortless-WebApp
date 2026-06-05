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

export interface SpinResult {
  outcome: SpinOutcome;
  effectiveTier: RewardTier;
  like?: { id: string; label: string };
  spinnerLikes: { id: string; label: string }[];
  winningIndex: number;
  tokenBalances: Record<RewardTier, number>;
  newTokenFromLevelUp: boolean;
}
