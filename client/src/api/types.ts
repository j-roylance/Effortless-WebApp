import type { RewardTier, SpinOutcome } from "../domain/tiers";

export interface User {
  id: string;
  email: string;
}

export interface Habit {
  id: string;
  name: string;
  tier: RewardTier;
  persistAfterDone: boolean;
  sortOrder: number;
  achievedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export interface UserReward {
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
  reward?: { id: string; label: string };
  spinnerRewards: { id: string; label: string }[];
  winningIndex: number;
  tokenBalances: Record<RewardTier, number>;
  newTokenFromLevelUp: boolean;
}
