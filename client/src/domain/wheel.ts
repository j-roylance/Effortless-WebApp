import type { RewardTier } from "./tiers";

export interface TierWheelConfig {
  tier: RewardTier;
  multiplier: number;
  sliceCounts: Record<string, number>;
  totalSlices: number;
  assignedSlices: number;
  emptySlices: number;
}

/** Same formula as server `totalSlices` in server/src/domain/wheel.ts */
export function totalSlices(likeCount: number, multiplier: number): number {
  return Math.max(0, likeCount) * Math.max(1, multiplier);
}
